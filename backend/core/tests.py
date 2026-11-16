from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from customers.models import Customer
from core.emails import send_templated_email
from core.exceptions import UnsupportedFileTypeError, _extract_errors
from core.uploads import JPG, PDF, WEBP, detect_kind, get_image_dimensions, sanitize_svg
from orders.models import Order, OrderStatus, PaymentMethod, PaymentStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(email='admin@trikonos.cz', password='x', name='Admin')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _order(*, email, status=OrderStatus.NEW, total=None, created_at=None,
           payment_method=None, payment_status=PaymentStatus.PENDING, order_number=None):
    customer = Customer.objects.create(email=email, first_name='Jana', last_name='Nováková')
    order = Order.objects.create(
        order_number=order_number or f'TRK-2026-{email}',
        customer=customer,
        status=status,
        total=total,
        payment_method=payment_method,
        payment_status=payment_status,
        billing_full_name='Jana Nováková', billing_street='Horní 12', billing_city='Vrchlabí', billing_zip='54301',
        shipping_full_name='Jana Nováková', shipping_street='Horní 12', shipping_city='Vrchlabí', shipping_zip='54301',
    )
    if created_at is not None:
        Order.objects.filter(pk=order.pk).update(created_at=created_at)
        order.refresh_from_db()
    return order


# ---------------------------------------------------------------------------
# GET /admin/search
# ---------------------------------------------------------------------------

def test_search_requires_admin_login():
    response = APIClient().get('/api/v1/admin/search', {'q': 'jana'})

    assert response.status_code == 403


def test_search_without_query_returns_empty_lists(admin_client):
    response = admin_client.get('/api/v1/admin/search')

    assert response.status_code == 200
    assert response.data == {'orders': [], 'customers': [], 'motifs': []}


def test_search_finds_order_by_customer_email(admin_client):
    order = _order(email='jana@example.cz')

    response = admin_client.get('/api/v1/admin/search', {'q': 'jana@example.cz'})

    assert response.status_code == 200
    assert [row['id'] for row in response.data['orders']] == [order.id]
    assert [row['id'] for row in response.data['customers']] == [order.customer.id]


# ---------------------------------------------------------------------------
# GET /admin/dashboard
# ---------------------------------------------------------------------------

def test_dashboard_requires_admin_login():
    response = APIClient().get('/api/v1/admin/dashboard')

    assert response.status_code == 403


def test_dashboard_counts_orders_and_revenue_today_and_yesterday(admin_client):
    now = timezone.now()
    yesterday = now - timedelta(days=1)

    _order(email='today-a@example.cz', total=10000, created_at=now)
    _order(email='today-b@example.cz', total=20000, created_at=now)
    # Cancelled orders never count towards revenue, today or any day.
    _order(email='today-cancelled@example.cz', status=OrderStatus.CANCELLED, total=99900, created_at=now)
    _order(email='yesterday@example.cz', total=5000, created_at=yesterday)

    response = admin_client.get('/api/v1/admin/dashboard')

    assert response.status_code == 200
    assert response.data['orders_today'] == 3
    assert response.data['revenue_today'] == 30000
    assert response.data['orders_yesterday'] == 1
    assert response.data['revenue_yesterday'] == 5000


def test_dashboard_pending_quotes_and_orders_to_process(admin_client):
    _order(email='quote@example.cz', status=OrderStatus.QUOTE_REQUESTED)
    _order(email='new@example.cz', status=OrderStatus.NEW)
    _order(email='paid@example.cz', status=OrderStatus.PAID)
    _order(email='processing@example.cz', status=OrderStatus.PROCESSING)
    _order(email='shipped@example.cz', status=OrderStatus.SHIPPED)

    response = admin_client.get('/api/v1/admin/dashboard')

    assert response.data['pending_quotes'] == 1
    assert response.data['orders_to_process'] == 3


def test_dashboard_unpaid_invoices_excludes_cash_on_delivery_and_paid(admin_client):
    _order(email='unpaid-transfer@example.cz', payment_method=PaymentMethod.BANK_TRANSFER, payment_status=PaymentStatus.PENDING)
    _order(email='unpaid-invoice@example.cz', payment_method=PaymentMethod.INVOICE, payment_status=PaymentStatus.PENDING)
    _order(email='paid-transfer@example.cz', payment_method=PaymentMethod.BANK_TRANSFER, payment_status=PaymentStatus.PAID)
    _order(email='unpaid-cod@example.cz', payment_method=PaymentMethod.CASH_ON_DELIVERY, payment_status=PaymentStatus.PENDING)

    response = admin_client.get('/api/v1/admin/dashboard')

    assert response.data['unpaid_invoices'] == 2


def test_dashboard_new_customers_last_7_days(admin_client):
    now = timezone.now()
    recent = _order(email='recent@example.cz').customer
    old = _order(email='old@example.cz').customer
    Customer.objects.filter(pk=old.pk).update(created_at=now - timedelta(days=10))

    response = admin_client.get('/api/v1/admin/dashboard')

    assert response.data['new_customers_7d'] == 1


def test_dashboard_recent_orders_lists_last_10_newest_first(admin_client):
    for i in range(12):
        _order(email=f'order{i}@example.cz', order_number=f'TRK-2026-{i:04d}', total=1000 * i,
               created_at=timezone.now() - timedelta(minutes=12 - i))

    response = admin_client.get('/api/v1/admin/dashboard')

    recent = response.data['recent_orders']
    assert len(recent) == 10
    assert recent[0]['order_number'] == 'TRK-2026-0011'
    assert recent[-1]['order_number'] == 'TRK-2026-0002'


def test_dashboard_query_count_does_not_grow_with_order_count(admin_client, django_assert_max_num_queries):
    for i in range(20):
        _order(email=f'bulk{i}@example.cz', total=1000)

    with django_assert_max_num_queries(10):
        response = admin_client.get('/api/v1/admin/dashboard')

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# core.uploads helpers
# ---------------------------------------------------------------------------

def test_detect_kind_jpg():
    assert detect_kind(b'\xff\xd8\xff\xe0rest of a jpeg file') == JPG


def test_detect_kind_webp():
    assert detect_kind(b'RIFF\x00\x00\x00\x00WEBPVP8 rest') == WEBP


def test_detect_kind_pdf():
    assert detect_kind(b'%PDF-1.4\nrest of a pdf file') == PDF


def test_get_image_dimensions_returns_none_for_corrupt_data():
    assert get_image_dimensions(b'\xff\xd8\xffnot actually a decodable jpeg', JPG) == (None, None)


# ---------------------------------------------------------------------------
# core.uploads.sanitize_svg - allowlist walker branches not already hit via
# orders/tests/test_views.py's upload-endpoint tests (those exercise the
# tag-removal path; these target the attribute-level branches directly,
# since an attribute on a *disallowed* element never gets individually
# inspected - the whole element is dropped first).
# ---------------------------------------------------------------------------

def test_sanitize_svg_strips_unsafe_href_on_an_allowed_element():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>'
    result = sanitize_svg(svg)
    assert b'javascript:' not in result.lower()


def test_sanitize_svg_keeps_fragment_href_on_an_allowed_element():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><use href="#shape1"/></svg>'
    result = sanitize_svg(svg)
    assert b'href="#shape1"' in result or b"href='#shape1'" in result


def test_sanitize_svg_strips_attribute_not_on_allowlist():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><rect data-foo="bar" width="10" height="10"/></svg>'
    result = sanitize_svg(svg)
    assert b'data-foo' not in result


def test_sanitize_svg_strips_javascript_url_inside_style_attribute():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(javascript:alert(1))" width="10" height="10"/></svg>'
    result = sanitize_svg(svg)
    assert b'javascript:' not in result.lower()


def test_sanitize_svg_rejects_non_svg_root_element():
    with pytest.raises(UnsupportedFileTypeError):
        sanitize_svg(b'<?xml version="1.0"?><root><svg></svg></root>')


# ---------------------------------------------------------------------------
# GET /config, POST /contact
# ---------------------------------------------------------------------------

def test_config_returns_shop_settings_and_choice_lists():
    response = APIClient().get('/api/v1/config')

    assert response.status_code == 200
    assert 'shop_name' in response.data
    assert len(response.data['payment_methods']) > 0
    assert len(response.data['delivery_types']) > 0


def test_contact_form_sends_email_to_shop(settings):
    settings.SHOP_CONFIG = {**settings.SHOP_CONFIG, 'NOTIFY_EMAIL': 'shop@trikonos.cz'}

    response = APIClient().post('/api/v1/contact', {
        'name': 'Jana', 'email': 'jana@example.cz', 'message': 'Mám zájem o poptávku.',
    }, format='json')

    assert response.status_code == 204
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ['shop@trikonos.cz']


def test_contact_form_honeypot_filled_sends_no_email(settings):
    settings.SHOP_CONFIG = {**settings.SHOP_CONFIG, 'NOTIFY_EMAIL': 'shop@trikonos.cz'}

    response = APIClient().post('/api/v1/contact', {
        'name': 'Bot', 'email': 'bot@example.cz', 'message': 'spam', 'website': 'http://spam.example',
    }, format='json')

    assert response.status_code == 204
    assert len(mail.outbox) == 0


def test_extract_errors_flattens_a_list_of_nested_per_item_error_dicts():
    # Shape DRF produces for a many=True field (e.g. OrderCreateSerializer's
    # `items`) when only some list elements are invalid: a list where each
    # position is either {} (valid) or a dict of that item's own field
    # errors - a list containing dicts, not just plain strings.
    general, fields = _extract_errors({'items': [{}, {'cut_id': ['This field is required.']}]})

    assert general == []
    assert fields == {'items.cut_id': ['This field is required.']}


def test_extract_errors_handles_bare_non_field_error_string():
    # A top-level non_field_errors/detail key is normally a list of
    # messages, but DRF's error-detail normalization leaves a single
    # top-level validate() string as a bare ErrorDetail (not list-wrapped)
    # when raised as the dict value directly, rather than via the usual
    # serializers.ValidationError('message') call - both end up handled as
    # general (non-field) messages either way.
    general, fields = _extract_errors({'non_field_errors': 'Something went wrong.'})

    assert general == ['Something went wrong.']
    assert fields == {}


def test_contact_form_without_notify_email_configured_still_returns_204(settings):
    settings.SHOP_CONFIG = {**settings.SHOP_CONFIG, 'NOTIFY_EMAIL': ''}

    response = APIClient().post('/api/v1/contact', {
        'name': 'Jana', 'email': 'jana@example.cz', 'message': 'Dotaz',
    }, format='json')

    assert response.status_code == 204
    assert len(mail.outbox) == 0


# ---------------------------------------------------------------------------
# core.emails.send_templated_email
# ---------------------------------------------------------------------------

def test_send_templated_email_swallows_and_logs_send_failure():
    with patch('django.core.mail.EmailMultiAlternatives.send', side_effect=Exception('smtp down')):
        send_templated_email(
            'order_cancelled', {'order_number': 'TRK-2026-0001'},
            subject='Test', recipient_list=['jana@example.cz'],
        )  # must not raise


# ---------------------------------------------------------------------------
# GET /admin/stats/revenue
# ---------------------------------------------------------------------------

def test_revenue_stats_requires_admin_login():
    response = APIClient().get('/api/v1/admin/stats/revenue')
    assert response.status_code in (401, 403)


def test_revenue_stats_groups_by_day_and_excludes_cancelled_and_refunded(admin_client):
    today = timezone.now()
    _order(email='a@example.cz', status=OrderStatus.NEW, total=10000, created_at=today)
    _order(email='b@example.cz', status=OrderStatus.PAID, total=5000, created_at=today)
    _order(email='c@example.cz', status=OrderStatus.CANCELLED, total=99999, created_at=today)
    _order(email='d@example.cz', status=OrderStatus.REFUNDED, total=99999, created_at=today)

    response = admin_client.get('/api/v1/admin/stats/revenue', {
        'createdFrom': today.date().isoformat(), 'createdTo': today.date().isoformat(),
    })

    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]['revenue'] == 15000
    assert response.data[0]['orders_count'] == 2


def test_revenue_stats_defaults_to_last_30_days(admin_client):
    recent = timezone.now()
    old = recent - timedelta(days=45)
    _order(email='recent@example.cz', status=OrderStatus.NEW, total=10000, created_at=recent)
    _order(email='old@example.cz', status=OrderStatus.NEW, total=20000, created_at=old)

    response = admin_client.get('/api/v1/admin/stats/revenue')

    assert response.status_code == 200
    assert sum(row['revenue'] for row in response.data) == 10000


def test_revenue_stats_monthly_interval_groups_whole_month(admin_client):
    early = timezone.make_aware(timezone.datetime(2026, 3, 2))
    late = timezone.make_aware(timezone.datetime(2026, 3, 20))
    _order(email='early@example.cz', status=OrderStatus.NEW, total=10000, created_at=early)
    _order(email='late@example.cz', status=OrderStatus.NEW, total=5000, created_at=late)
    params = {'createdFrom': '2026-03-01', 'createdTo': '2026-03-31'}

    daily = admin_client.get('/api/v1/admin/stats/revenue', {**params, 'interval': 'DAY'})
    monthly = admin_client.get('/api/v1/admin/stats/revenue', {**params, 'interval': 'MONTH'})

    assert len(daily.data) == 2
    assert len(monthly.data) == 1
    assert monthly.data[0]['revenue'] == 15000
    assert monthly.data[0]['orders_count'] == 2


# ---------------------------------------------------------------------------
# GET /admin/stats/top-motifs
# ---------------------------------------------------------------------------

def test_top_motifs_requires_admin_login():
    response = APIClient().get('/api/v1/admin/stats/top-motifs')
    assert response.status_code in (401, 403)


def test_top_motifs_excludes_custom_items_and_cancelled_orders(
    admin_client, motif, product_type, cut, color, print_area,
):
    from catalog.models import Motif, MotifVariant
    from orders.services import build_order_item

    # unit_price = motif.price + product_type.price (300 + 500 = 800) * 10 pieces
    # ranks higher by quantity but lower by revenue than `motif` below.
    cheap_motif = Motif.objects.create(name='Hory', slug='hory', price=300, category=motif.category)
    MotifVariant.objects.create(motif=cheap_motif, product_type=product_type, cut=cut, color=color, size='M')

    order = _order(email='x@example.cz', status=OrderStatus.NEW, total=0, created_at=timezone.now())
    build_order_item(order, {
        'is_custom': False, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1, 'placements': [],
    })
    build_order_item(order, {
        'is_custom': False, 'motif': cheap_motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 10, 'placements': [],
    })
    build_order_item(order, {
        'is_custom': True, 'motif': None, 'custom_text': 'Logo', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 50,
        'placements': [{'print_area': print_area, 'url': 'https://example.cz/f.png', 'width': 100, 'height': 100}],
    })
    cancelled_order = _order(email='y@example.cz', status=OrderStatus.CANCELLED, total=0, created_at=timezone.now())
    build_order_item(cancelled_order, {
        'is_custom': False, 'motif': cheap_motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 400, 'placements': [],
    })

    by_quantity = admin_client.get('/api/v1/admin/stats/top-motifs')
    by_revenue = admin_client.get('/api/v1/admin/stats/top-motifs', {'metric': 'REVENUE'})

    assert by_quantity.status_code == 200
    quantities = {row['motif_name']: row['quantity'] for row in by_quantity.data}
    assert quantities == {motif.name: 1, cheap_motif.name: 10}  # custom item and cancelled order excluded
    assert by_quantity.data[0]['motif_name'] == cheap_motif.name  # ranked by quantity: 10 > 1
    assert by_revenue.data[0]['motif_name'] == motif.name  # ranked by revenue: pricier motif wins despite fewer units
