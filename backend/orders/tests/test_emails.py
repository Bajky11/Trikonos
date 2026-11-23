import pytest
from django.core import mail

from core.exceptions import BusinessError
from customers.models import Customer
from orders.emails import resend_order_email, send_shop_notification_email
from orders.models import Order, OrderStatus
from orders.services import build_order_item

pytestmark = pytest.mark.django_db


def _order():
    customer = Customer.objects.create(email='jana@example.cz', first_name='Jana', last_name='Nováková')
    return Order.objects.create(
        order_number='TRK-2026-8001', customer=customer, status=OrderStatus.NEW,
        billing_full_name='Jana', billing_street='Horní 12', billing_city='Vrchlabí', billing_zip='54301',
        shipping_full_name='Jana', shipping_street='Horní 12', shipping_city='Vrchlabí', shipping_zip='54301',
    )


def test_send_shop_notification_email_skips_when_notify_email_not_configured(settings):
    settings.SHOP_CONFIG = {**settings.SHOP_CONFIG, 'NOTIFY_EMAIL': ''}
    order = _order()

    send_shop_notification_email(order)

    assert len(mail.outbox) == 0


def test_send_shop_notification_email_sends_when_configured(settings):
    settings.SHOP_CONFIG = {**settings.SHOP_CONFIG, 'NOTIFY_EMAIL': 'shop@trikonos.cz'}
    order = _order()

    send_shop_notification_email(order)

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ['shop@trikonos.cz']


def test_resend_order_email_with_unknown_type_raises():
    order = _order()

    with pytest.raises(BusinessError) as exc_info:
        resend_order_email(order, 'NOT_A_REAL_TYPE')
    assert exc_info.value.code == 'UNKNOWN_EMAIL_TYPE'
