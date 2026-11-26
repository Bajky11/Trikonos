"""Django-aware orchestration for POHODA mServer invoicing - the HTTP/XML
plumbing lives in `orders.pohoda_client`, this module owns the DB state
machine (see `orders.models.PohodaInvoice`) and decides what to do with
each outcome. Never called from a request/response cycle beyond inserting
a PENDING row (see `create_invoice_request`) - the actual network calls
only ever happen from the `process_pohoda_invoices` management command, so
an admin can always confirm an order even if POHODA is unreachable.
"""
import logging

from django.db import transaction
from django.utils import timezone

from . import pohoda_client
from .models import Order, PohodaInvoice

logger = logging.getLogger(__name__)

MAX_ISSUANCE_ATTEMPTS = 20
MAX_PDF_ATTEMPTS = 10


def _billing_snapshot(order):
    return {
        'full_name': order.billing_full_name,
        'company_name': order.billing_company_name,
        'ico': order.billing_ico,
        'dic': order.billing_dic,
        'street': order.billing_street,
        'city': order.billing_city,
        'zip': order.billing_zip,
        'country': order.billing_country,
    }


def _items_snapshot(order):
    return [
        {'label': item.item_label, 'unit_price': item.unit_price, 'quantity': item.quantity}
        for item in order.items.all()
    ]


def create_invoice_request(order):
    """Called from the admin `/confirm` action, inside its transaction, only
    on a genuinely fresh confirmation (see admin_views.py). Only ever
    inserts a row - never talks to mServer itself, so a POHODA outage never
    blocks confirming an order.
    """
    locked_order = Order.objects.select_for_update().get(pk=order.pk)
    existing = PohodaInvoice.objects.filter(order=locked_order).exclude(status=PohodaInvoice.Status.SUPERSEDED).first()
    if existing is not None:
        return existing

    return PohodaInvoice.objects.create(
        order=locked_order,
        order_number=locked_order.order_number,
        currency=locked_order.currency,
        subtotal_amount=locked_order.subtotal or 0,
        shipping_cost_amount=locked_order.shipping_cost or 0,
        total_amount=locked_order.total or 0,
        billing_snapshot=_billing_snapshot(locked_order),
        items_snapshot=_items_snapshot(locked_order),
    )


def supersede_active_invoice(order):
    """Called whenever `_unconfirm_if_confirmed` actually clears
    `confirmed_at` - the order must be reconfirmed (and, if it still needs
    invoicing, get a brand new PohodaInvoice row/request_id) before
    invoicing can proceed again.
    """
    active = PohodaInvoice.objects.filter(order=order).exclude(status=PohodaInvoice.Status.SUPERSEDED).first()
    if active is None:
        return
    if active.status == PohodaInvoice.Status.ISSUED:
        logger.warning(
            'Superseding an already-ISSUED PohodaInvoice %s for order %s - a stale invoice '
            '(number %s) may exist in POHODA and needs accountant follow-up.',
            active.id, order.order_number, active.pohoda_invoice_number,
        )
    active.status = PohodaInvoice.Status.SUPERSEDED
    active.save(update_fields=['status', 'updated_at'])


def _apply_issued(invoice, result):
    invoice.status = PohodaInvoice.Status.ISSUED
    invoice.pohoda_invoice_number = result.invoice_number
    invoice.pohoda_internal_id = result.internal_id
    invoice.last_error = ''
    invoice.save(update_fields=['status', 'pohoda_invoice_number', 'pohoda_internal_id', 'last_error', 'updated_at'])


def process_issuance(invoice):
    """Advances a PENDING/REQUESTED PohodaInvoice row by one step. Safe to
    call repeatedly (e.g. every cron tick) - each outcome either reaches a
    terminal state or stays put for the next tick.
    """
    with transaction.atomic():
        row = PohodaInvoice.objects.select_for_update(skip_locked=True).filter(pk=invoice.pk).first()
        if row is None or row.status not in (PohodaInvoice.Status.PENDING, PohodaInvoice.Status.REQUESTED):
            return row.status if row is not None else None

        row.attempts += 1
        row.last_attempted_at = timezone.now()

        try:
            if row.status == PohodaInvoice.Status.REQUESTED:
                # Ambiguous outcome from a previous attempt (timeout) - check
                # whether POHODA already created the invoice before resending.
                found = pohoda_client.find_issued_invoice(row.order_number)
                if found is not None:
                    _apply_issued(row, found)
                    return row.status

            result = pohoda_client.submit_invoice(row)
        except pohoda_client.PohodaConnectionError as exc:
            row.status = PohodaInvoice.Status.REQUESTED
            row.last_error = str(exc)
            if row.attempts >= MAX_ISSUANCE_ATTEMPTS:
                row.status = PohodaInvoice.Status.FAILED
            row.save(update_fields=['status', 'attempts', 'last_attempted_at', 'last_error', 'updated_at'])
            return row.status
        except pohoda_client.PohodaProtocolError as exc:
            row.status = PohodaInvoice.Status.REQUESTED
            row.last_error = str(exc)
            if row.attempts >= MAX_ISSUANCE_ATTEMPTS:
                row.status = PohodaInvoice.Status.FAILED
            row.save(update_fields=['status', 'attempts', 'last_attempted_at', 'last_error', 'updated_at'])
            logger.error('Unexpected POHODA response shape for invoice request %s: %s', row.id, exc)
            return row.status

        if result.outcome == 'issued':
            row.save(update_fields=['attempts', 'last_attempted_at'])
            _apply_issued(row, result)
        elif result.outcome == 'duplicate':
            # Already imported by an earlier attempt we lost track of (e.g.
            # a timeout) - find the real invoice number via a list query.
            found = pohoda_client.find_issued_invoice(row.order_number)
            row.save(update_fields=['attempts', 'last_attempted_at'])
            if found is not None:
                _apply_issued(row, found)
            else:
                row.status = PohodaInvoice.Status.REQUESTED
                row.last_error = 'POHODA reported a duplicate but the invoice could not be located by order number.'
                row.save(update_fields=['status', 'last_error', 'updated_at'])
        else:  # rejected
            row.status = PohodaInvoice.Status.FAILED
            row.last_error = result.error_message
            row.save(update_fields=['status', 'attempts', 'last_attempted_at', 'last_error', 'updated_at'])

        return row.status


def process_pdf_delivery(invoice):
    """Fetches the PDF for an ISSUED invoice and e-mails it to the customer.
    Never touches `invoice.status` - a PDF/e-mail failure must never look
    like an invoicing failure, and must never cause a second invoice to be
    issued.
    """
    from .emails import send_invoice_email

    with transaction.atomic():
        row = PohodaInvoice.objects.select_for_update(skip_locked=True).filter(
            pk=invoice.pk, status=PohodaInvoice.Status.ISSUED,
        ).exclude(pdf_delivery_status=PohodaInvoice.PdfStatus.SENT).first()
        if row is None:
            return None

        row.pdf_delivery_attempts += 1
        try:
            pdf_bytes = pohoda_client.fetch_invoice_pdf(row.pohoda_internal_id)
            send_invoice_email(row.order, pdf_bytes, row.pohoda_invoice_number, raise_on_failure=True)
        except Exception as exc:
            row.pdf_delivery_last_error = str(exc)
            if row.pdf_delivery_attempts >= MAX_PDF_ATTEMPTS:
                row.pdf_delivery_status = PohodaInvoice.PdfStatus.FAILED
            row.save(update_fields=['pdf_delivery_status', 'pdf_delivery_attempts', 'pdf_delivery_last_error', 'updated_at'])
            return row.pdf_delivery_status

        row.pdf_delivery_status = PohodaInvoice.PdfStatus.SENT
        row.pdf_delivery_last_error = ''
        row.pdf_delivered_at = timezone.now()
        row.save(update_fields=[
            'pdf_delivery_status', 'pdf_delivery_attempts', 'pdf_delivery_last_error', 'pdf_delivered_at', 'updated_at',
        ])
        return row.pdf_delivery_status


def retry_invoice(order):
    """Admin-triggered manual retry (`POST /admin/orders/{id}/pohoda-invoice/retry`).
    Never issues a new request_id - nothing new needs to be created in
    POHODA, the existing request/invoice is still the right one to resend
    or re-deliver.
    """
    active = PohodaInvoice.objects.filter(order=order).exclude(status=PohodaInvoice.Status.SUPERSEDED).first()
    if active is None:
        return None

    if active.status == PohodaInvoice.Status.FAILED:
        active.status = PohodaInvoice.Status.PENDING
        active.attempts = 0
        active.last_error = ''
        active.save(update_fields=['status', 'attempts', 'last_error', 'updated_at'])
    elif active.pdf_delivery_status == PohodaInvoice.PdfStatus.FAILED or (
        active.status == PohodaInvoice.Status.ISSUED
        and active.pdf_delivery_status != PohodaInvoice.PdfStatus.SENT
    ):
        active.pdf_delivery_status = PohodaInvoice.PdfStatus.NOT_STARTED
        active.pdf_delivery_attempts = 0
        active.pdf_delivery_last_error = ''
        active.save(update_fields=['pdf_delivery_status', 'pdf_delivery_attempts', 'pdf_delivery_last_error', 'updated_at'])

    return active
