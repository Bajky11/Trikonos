import uuid

from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import UUIDModel

from .order import Order


class PohodaInvoice(UUIDModel):
    """One invoicing request towards POHODA mServer for a confirmed Order.

    `order` is a plain FK (not OneToOne) because an order can be unconfirmed
    (price/shipping change) and reconfirmed later - that supersedes this row
    rather than reusing it (see `orders.pohoda.supersede_active_invoice`), so
    more than one row per order can exist over time. The partial unique
    constraint below still guarantees at most one *active* (non-SUPERSEDED)
    row per order at any moment - that's what makes a repeated admin
    `/confirm` call never create a second invoice request.

    `request_id` is the stable id reused on every retry for the same
    invoicing attempt as both the XML `dataPack` and `dataPackItem` id -
    POHODA's `check_duplicity` import option rejects a resend of an
    already-imported id as a duplicate instead of creating a second invoice.
    A price/content change always gets a brand new row (and therefore a new
    request_id) rather than reusing this one - resending the same id with
    different amounts is unverified/unsafe behaviour on POHODA's side.
    """

    class Status(models.TextChoices):
        PENDING = 'PENDING', _('Pending')
        REQUESTED = 'REQUESTED', _('Requested (outcome unconfirmed)')
        ISSUED = 'ISSUED', _('Issued')
        FAILED = 'FAILED', _('Failed')
        SUPERSEDED = 'SUPERSEDED', _('Superseded')

    class PdfStatus(models.TextChoices):
        NOT_STARTED = 'NOT_STARTED', _('Not started')
        SENT = 'SENT', _('Sent')
        FAILED = 'FAILED', _('Failed')

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name='pohoda_invoices')
    request_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    last_attempted_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default='')

    pohoda_invoice_number = models.CharField(max_length=50, blank=True, default='')
    pohoda_internal_id = models.CharField(max_length=50, blank=True, default='')

    # Snapshot taken when this row is created - the XML is always built from
    # this snapshot, never from the live order/items, so a retry under the
    # same request_id stays byte-for-byte reproducible even if the order is
    # edited afterwards (an edit that actually changes price/shipping/qty
    # supersedes this row instead - see module docstring).
    order_number = models.CharField(max_length=50)
    currency = models.CharField(max_length=3)
    subtotal_amount = models.PositiveIntegerField()
    shipping_cost_amount = models.PositiveIntegerField()
    total_amount = models.PositiveIntegerField()
    billing_snapshot = models.JSONField()
    items_snapshot = models.JSONField()

    pdf_delivery_status = models.CharField(max_length=12, choices=PdfStatus.choices, default=PdfStatus.NOT_STARTED)
    pdf_delivery_attempts = models.PositiveIntegerField(default=0)
    pdf_delivery_last_error = models.TextField(blank=True, default='')
    pdf_delivered_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pohoda_invoices'
        constraints = [
            models.UniqueConstraint(
                fields=['order'], condition=~models.Q(status='SUPERSEDED'),
                name='orders_pohodainvoice_one_active_per_order',
            ),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.order_number} ({self.status})'
