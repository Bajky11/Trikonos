from unittest.mock import patch

import pytest
from django.core.management import call_command

from customers.models import Customer
from orders.models import Order, OrderStatus, PaymentMethod, PohodaInvoice
from orders.services import build_order_item

pytestmark = pytest.mark.django_db


def _order(motif, product_type, cut, color, carrier, order_number='TRK-2026-0001'):
    customer = Customer.objects.create(email=f'{order_number}@example.cz', first_name='Jana', last_name='Nováková')
    order = Order.objects.create(
        order_number=order_number, customer=customer, status=OrderStatus.NEW,
        subtotal=59900, shipping_cost=5000, total=64900, carrier=carrier,
        payment_method=PaymentMethod.BANK_TRANSFER,
        billing_full_name='Jana Nováková', billing_street='Horní 12', billing_city='Vrchlabí', billing_zip='54301',
        shipping_full_name='Jana Nováková', shipping_street='Horní 12', shipping_city='Vrchlabí', shipping_zip='54301',
    )
    build_order_item(order, {
        'is_custom': False, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1, 'placements': [],
    })
    return order


def _invoice_for(order, **extra):
    from orders import pohoda
    invoice = pohoda.create_invoice_request(order)
    for key, value in extra.items():
        setattr(invoice, key, value)
    invoice.save()
    return invoice


def test_disabled_integration_is_a_no_op(settings, motif, product_type, cut, color, carrier, capsys):
    settings.POHODA_ENABLED = False
    order = _order(motif, product_type, cut, color, carrier)
    _invoice_for(order)

    call_command('process_pohoda_invoices')

    captured = capsys.readouterr()
    assert 'disabled' in captured.out.lower()
    assert PohodaInvoice.objects.get(order=order).status == PohodaInvoice.Status.PENDING


def test_processes_pending_issuance_and_pdf_delivery_in_one_run(settings, motif, product_type, cut, color, carrier):
    settings.POHODA_ENABLED = True
    pending_order = _order(motif, product_type, cut, color, carrier, order_number='TRK-2026-0001')
    pending_invoice = _invoice_for(pending_order)

    issued_order = _order(motif, product_type, cut, color, carrier, order_number='TRK-2026-0002')
    issued_invoice = _invoice_for(
        issued_order, status=PohodaInvoice.Status.ISSUED, pohoda_internal_id='42', pohoda_invoice_number='2026001',
    )

    from orders.pohoda_client import InvoiceResult
    with patch('orders.pohoda_client.submit_invoice', return_value=InvoiceResult('issued', '2026002', '43', '', '')), \
         patch('orders.pohoda_client.fetch_invoice_pdf', return_value=b'%PDF-fake'), \
         patch('orders.emails.send_invoice_email'):
        call_command('process_pohoda_invoices')

    pending_invoice.refresh_from_db()
    issued_invoice.refresh_from_db()
    assert pending_invoice.status == PohodaInvoice.Status.ISSUED
    assert issued_invoice.pdf_delivery_status == PohodaInvoice.PdfStatus.SENT


def test_one_failing_row_does_not_block_the_rest_of_the_batch(settings, motif, product_type, cut, color, carrier):
    settings.POHODA_ENABLED = True
    broken_order = _order(motif, product_type, cut, color, carrier, order_number='TRK-2026-0001')
    broken_invoice = _invoice_for(broken_order)
    healthy_order = _order(motif, product_type, cut, color, carrier, order_number='TRK-2026-0002')
    healthy_invoice = _invoice_for(healthy_order)

    from orders.pohoda_client import InvoiceResult

    def submit_side_effect(invoice):
        if invoice.pk == broken_invoice.pk:
            raise RuntimeError('boom - totally unexpected bug')
        return InvoiceResult('issued', '2026002', '43', '', '')

    with patch('orders.pohoda_client.submit_invoice', side_effect=submit_side_effect):
        call_command('process_pohoda_invoices')

    healthy_invoice.refresh_from_db()
    broken_invoice.refresh_from_db()
    assert healthy_invoice.status == PohodaInvoice.Status.ISSUED
    assert broken_invoice.status == PohodaInvoice.Status.PENDING  # untouched, not crashed into a bad state
