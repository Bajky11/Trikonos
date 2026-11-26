"""Comgate HTTP POST v1.0. This pilot never creates a live payment."""
from urllib.parse import parse_qsl, urlsplit

import requests
from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import APIException, ValidationError

from .models import ComgatePayment, Order, OrderStatus, PaymentMethod, PaymentStatus


class GatewayUnavailable(APIException):
    status_code = 503
    default_detail = 'Comgate teď nelze ověřit. Objednávku nevytvářejte znovu.'


def enabled():
    return settings.COMGATE_TEST_ENABLED and bool(settings.COMGATE_MERCHANT and settings.COMGATE_SECRET)


def valid_amount(amount):
    return amount is not None and 100 <= amount <= 100_000_000


def payable(order):
    return (order.payment_method == PaymentMethod.CARD_ONLINE and order.status == OrderStatus.NEW
            and order.confirmed_at is not None and order.payment_status == PaymentStatus.PENDING
            and order.currency == 'CZK' and valid_amount(order.total))


def valid_redirect(url):
    try:
        parsed = urlsplit(url)
        host = parsed.hostname or ''
        return (parsed.scheme == 'https' and parsed.username is None and parsed.port in (None, 443)
                and (host == 'comgate.cz' or host.endswith('.comgate.cz'))
                and not any(character.isspace() or character == '\\' for character in url))
    except ValueError:
        return False


def _post(operation, **data):
    try:
        response = requests.post(
            f'https://payments.comgate.cz/v1.0/{operation}',
            data={'merchant': settings.COMGATE_MERCHANT, 'secret': settings.COMGATE_SECRET, **data},
            headers={'Accept': 'application/x-www-form-urlencoded'},
            allow_redirects=False, timeout=(3, 6),
        )
        if response.status_code in (200, 201):
            fields = dict(parse_qsl(response.content.decode('utf-8'), max_num_fields=100))
            if fields.get('code') == '0':
                return fields
    except (requests.RequestException, ValueError):
        pass
    # Never surface the raw provider response (can include credentials / PII).
    raise GatewayUnavailable()


def start(order):
    # Commit a reservation before contacting a non-idempotent provider. If the
    # result is ambiguous, the row remains UNKNOWN and is never retried blindly.
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if not payable(order):
            raise ValidationError('Objednávka není připravena k platbě kartou.')
        payment, created = ComgatePayment.objects.get_or_create(order=order, defaults={
            'merchant': settings.COMGATE_MERCHANT, 'amount': order.total,
        })
    if not created:
        return payment
    fields = _post(
        'create', test='true', prepareOnly='true', price=payment.amount, curr='CZK', country='CZ',
        label='Trikonos', refId=order.order_number, method='CARD_ALL',
        enableApplePayGooglePay='false', email=order.customer.email, fullName=order.billing_full_name,
        category='PHYSICAL_GOODS_ONLY',
        delivery='HOME_DELIVERY' if order.delivery_type == 'HOME_DELIVERY' else 'PICKUP',
    )
    transaction_id = fields.get('transId', '')
    redirect = fields.get('redirect', '')
    if not transaction_id or len(transaction_id) > 128 or not valid_redirect(redirect) or len(redirect) > 2048:
        raise GatewayUnavailable()
    payment.transaction_id = transaction_id
    payment.redirect_url = redirect
    payment.state = ComgatePayment.State.PENDING
    payment.save(update_fields=['transaction_id', 'redirect_url', 'state'])
    return payment


def verify(payment):
    if payment.merchant != settings.COMGATE_MERCHANT:
        raise GatewayUnavailable()
    if payment.state != ComgatePayment.State.PENDING:
        return payment
    fields = _post('status', transId=payment.transaction_id)
    expected = {
        'merchant': payment.merchant, 'test': 'true', 'price': str(payment.amount), 'curr': 'CZK',
        'refId': payment.order.order_number, 'transId': payment.transaction_id,
    }
    state = fields.get('status')
    if any(fields.get(key) != value for key, value in expected.items()) or state not in (
        ComgatePayment.State.PENDING, ComgatePayment.State.PAID, ComgatePayment.State.CANCELLED,
    ):
        raise GatewayUnavailable()
    if state != ComgatePayment.State.PENDING:
        ComgatePayment.objects.filter(pk=payment.pk, state=ComgatePayment.State.PENDING).update(state=state)
    payment.refresh_from_db()
    # Even a successful test transaction must never unlock fulfillment.
    return payment
