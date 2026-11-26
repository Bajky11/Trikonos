from unittest.mock import patch

import pytest

from orders import pohoda, pohoda_client
from orders.models import Order, OrderStatus, PaymentMethod, PohodaInvoice
from orders.pohoda_client import InvoiceResult, PohodaConnectionError, PohodaProtocolError
from orders.services import build_order_item
from customers.models import Customer

pytestmark = pytest.mark.django_db


def _order(motif, product_type, cut, color, carrier, **extra):
    customer = Customer.objects.create(email='jana@example.cz', first_name='Jana', last_name='Nováková')
    fields = {
        'order_number': 'TRK-2026-0001', 'customer': customer, 'status': OrderStatus.NEW,
        'subtotal': 59900, 'shipping_cost': 5000, 'total': 64900,
        'carrier': carrier, 'payment_method': PaymentMethod.BANK_TRANSFER,
        'billing_full_name': 'Jana Nováková', 'billing_street': 'Horní 12', 'billing_city': 'Vrchlabí', 'billing_zip': '54301',
        'shipping_full_name': 'Jana Nováková', 'shipping_street': 'Horní 12', 'shipping_city': 'Vrchlabí', 'shipping_zip': '54301',
    }
    fields.update(extra)
    order = Order.objects.create(**fields)
    build_order_item(order, {
        'is_custom': False, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1, 'placements': [],
    })
    return order


@pytest.fixture
def order(motif, product_type, cut, color, carrier):
    return _order(motif, product_type, cut, color, carrier)


def test_create_invoice_request_is_idempotent(order):
    first = pohoda.create_invoice_request(order)
    second = pohoda.create_invoice_request(order)

    assert first.pk == second.pk
    assert PohodaInvoice.objects.filter(order=order).count() == 1
    assert first.total_amount == order.total


def test_supersede_then_create_gives_a_new_request_id(order):
    first = pohoda.create_invoice_request(order)

    pohoda.supersede_active_invoice(order)
    first.refresh_from_db()
    assert first.status == PohodaInvoice.Status.SUPERSEDED

    second = pohoda.create_invoice_request(order)

    assert second.pk != first.pk
    assert second.request_id != first.request_id
    assert PohodaInvoice.objects.filter(order=order).exclude(status=PohodaInvoice.Status.SUPERSEDED).count() == 1


def test_supersede_without_active_invoice_is_a_no_op(order):
    pohoda.supersede_active_invoice(order)  # nothing to supersede - must not raise


@pytest.mark.parametrize(('outcome', 'expected_status'), [
    ('issued', PohodaInvoice.Status.ISSUED),
    ('rejected', PohodaInvoice.Status.FAILED),
])
def test_process_issuance_pending_terminal_outcomes(order, outcome, expected_status):
    invoice = pohoda.create_invoice_request(order)
    result = InvoiceResult(outcome, '2026001' if outcome == 'issued' else '', '42' if outcome == 'issued' else '',
                            '' if outcome == 'issued' else '603', '' if outcome == 'issued' else 'bad data')

    with patch('orders.pohoda_client.submit_invoice', return_value=result):
        status = pohoda.process_issuance(invoice)

    invoice.refresh_from_db()
    assert status == expected_status
    assert invoice.status == expected_status
    if outcome == 'issued':
        assert invoice.pohoda_invoice_number == '2026001'
        assert invoice.pohoda_internal_id == '42'
    else:
        assert invoice.last_error == 'bad data'


def test_process_issuance_connection_error_moves_to_requested(order):
    invoice = pohoda.create_invoice_request(order)

    with patch('orders.pohoda_client.submit_invoice', side_effect=PohodaConnectionError('timeout')):
        status = pohoda.process_issuance(invoice)

    invoice.refresh_from_db()
    assert status == PohodaInvoice.Status.REQUESTED
    assert invoice.attempts == 1


def test_process_issuance_requested_resolves_via_list_query_without_resending(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.status = PohodaInvoice.Status.REQUESTED
    invoice.save(update_fields=['status'])
    found = InvoiceResult('issued', '2026001', '42', '', '')

    with patch('orders.pohoda_client.find_issued_invoice', return_value=found) as find, \
         patch('orders.pohoda_client.submit_invoice') as submit:
        status = pohoda.process_issuance(invoice)

    find.assert_called_once_with(invoice.order_number)
    submit.assert_not_called()
    invoice.refresh_from_db()
    assert status == PohodaInvoice.Status.ISSUED
    assert invoice.pohoda_invoice_number == '2026001'


def test_process_issuance_requested_resends_when_list_query_finds_nothing(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.status = PohodaInvoice.Status.REQUESTED
    invoice.save(update_fields=['status'])
    result = InvoiceResult('issued', '2026002', '43', '', '')

    with patch('orders.pohoda_client.find_issued_invoice', return_value=None), \
         patch('orders.pohoda_client.submit_invoice', return_value=result) as submit:
        status = pohoda.process_issuance(invoice)

    submit.assert_called_once()
    invoice.refresh_from_db()
    assert status == PohodaInvoice.Status.ISSUED


def test_process_issuance_gives_up_after_max_attempts(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.attempts = pohoda.MAX_ISSUANCE_ATTEMPTS - 1
    invoice.save(update_fields=['attempts'])

    with patch('orders.pohoda_client.submit_invoice', side_effect=PohodaProtocolError('weird response')):
        status = pohoda.process_issuance(invoice)

    invoice.refresh_from_db()
    assert status == PohodaInvoice.Status.FAILED


def test_process_issuance_ignores_rows_not_in_pending_or_requested(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.status = PohodaInvoice.Status.ISSUED
    invoice.save(update_fields=['status'])

    with patch('orders.pohoda_client.submit_invoice') as submit:
        status = pohoda.process_issuance(invoice)

    submit.assert_not_called()
    assert status == PohodaInvoice.Status.ISSUED


def test_process_pdf_delivery_success(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.status = PohodaInvoice.Status.ISSUED
    invoice.pohoda_internal_id = '42'
    invoice.pohoda_invoice_number = '2026001'
    invoice.save()

    with patch('orders.pohoda_client.fetch_invoice_pdf', return_value=b'%PDF-fake'), \
         patch('orders.emails.send_invoice_email') as send:
        status = pohoda.process_pdf_delivery(invoice)

    send.assert_called_once_with(invoice.order, b'%PDF-fake', '2026001', raise_on_failure=True)
    invoice.refresh_from_db()
    assert status == PohodaInvoice.PdfStatus.SENT
    assert invoice.pdf_delivered_at is not None
    assert invoice.status == PohodaInvoice.Status.ISSUED  # never touched


def test_process_pdf_delivery_failure_never_changes_invoice_status(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.status = PohodaInvoice.Status.ISSUED
    invoice.pohoda_internal_id = '42'
    invoice.save()

    with patch('orders.pohoda_client.fetch_invoice_pdf', side_effect=pohoda_client.PohodaConnectionError('down')):
        status = pohoda.process_pdf_delivery(invoice)

    invoice.refresh_from_db()
    assert status == PohodaInvoice.PdfStatus.NOT_STARTED
    assert invoice.status == PohodaInvoice.Status.ISSUED
    assert invoice.pdf_delivery_attempts == 1
    assert invoice.pdf_delivery_last_error


def test_process_pdf_delivery_email_failure_never_changes_invoice_status(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.status = PohodaInvoice.Status.ISSUED
    invoice.pohoda_internal_id = '42'
    invoice.save()

    with patch('orders.pohoda_client.fetch_invoice_pdf', return_value=b'%PDF-fake'), \
         patch('orders.emails.send_invoice_email', side_effect=RuntimeError('smtp down')):
        status = pohoda.process_pdf_delivery(invoice)

    invoice.refresh_from_db()
    assert status == PohodaInvoice.PdfStatus.NOT_STARTED
    assert invoice.status == PohodaInvoice.Status.ISSUED


def test_process_pdf_delivery_eventually_fails_after_max_attempts(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.status = PohodaInvoice.Status.ISSUED
    invoice.pdf_delivery_attempts = pohoda.MAX_PDF_ATTEMPTS - 1
    invoice.save()

    with patch('orders.pohoda_client.fetch_invoice_pdf', side_effect=pohoda_client.PohodaConnectionError('down')):
        status = pohoda.process_pdf_delivery(invoice)

    invoice.refresh_from_db()
    assert status == PohodaInvoice.PdfStatus.FAILED


def test_retry_invoice_resets_failed_issuance(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.status = PohodaInvoice.Status.FAILED
    invoice.attempts = 20
    invoice.last_error = 'boom'
    invoice.save()

    pohoda.retry_invoice(order)

    invoice.refresh_from_db()
    assert invoice.status == PohodaInvoice.Status.PENDING
    assert invoice.attempts == 0
    assert invoice.last_error == ''


def test_retry_invoice_resets_failed_pdf_delivery_without_new_request_id(order):
    invoice = pohoda.create_invoice_request(order)
    invoice.status = PohodaInvoice.Status.ISSUED
    invoice.pdf_delivery_status = PohodaInvoice.PdfStatus.FAILED
    invoice.pdf_delivery_attempts = 10
    invoice.pdf_delivery_last_error = 'smtp down'
    invoice.save()
    original_request_id = invoice.request_id

    pohoda.retry_invoice(order)

    invoice.refresh_from_db()
    assert invoice.pdf_delivery_status == PohodaInvoice.PdfStatus.NOT_STARTED
    assert invoice.pdf_delivery_attempts == 0
    assert invoice.status == PohodaInvoice.Status.ISSUED
    assert invoice.request_id == original_request_id
