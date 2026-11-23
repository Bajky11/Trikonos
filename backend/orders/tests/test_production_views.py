from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from customers.models import Customer
from orders.models import Order, OrderStatus
from orders.services import build_order_item

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(email='admin@trikonos.cz', password='x', name='Admin')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _order(status=OrderStatus.PAID, email='jana@example.cz', order_number='TRK-2026-7001', created_at=None):
    customer = Customer.objects.create(email=email, first_name='Jana', last_name='Nováková')
    order = Order.objects.create(
        order_number=order_number, customer=customer, status=status,
        billing_full_name='Jana', billing_street='Horní 12', billing_city='Vrchlabí', billing_zip='54301',
        shipping_full_name='Jana', shipping_street='Horní 12', shipping_city='Vrchlabí', shipping_zip='54301',
    )
    if created_at is not None:
        Order.objects.filter(pk=order.pk).update(created_at=created_at)
        order.refresh_from_db()
    return order


def test_production_summary_groups_quantity_by_type_cut_color_size(admin_client, motif, product_type, cut, color):
    order = _order()
    build_order_item(order, {
        'is_custom': False, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 5, 'placements': [],
    })

    response = admin_client.get('/api/v1/admin/production/summary')

    assert response.status_code == 200
    row = next(r for r in response.data if r['size'] == 'M')
    assert row['quantity'] == 5
    assert row['product_type'] == product_type.name
    assert row['cut'] == cut.name
    assert row['color'] == color.name


def test_production_summary_default_statuses_exclude_quote_requested(admin_client, motif, product_type, cut, color, print_area):
    order = _order(status=OrderStatus.QUOTE_REQUESTED)
    build_order_item(order, {
        'is_custom': True, 'motif': None, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 3,
        'placements': [{'print_area': print_area, 'url': 'a.png', 'x': 0, 'y': 0, 'width': 10, 'height': 10, 'rotation_deg': 0}],
    })

    response = admin_client.get('/api/v1/admin/production/summary')

    assert response.data == []


def test_production_summary_filtered_by_explicit_status(admin_client, motif, product_type, cut, color):
    order = _order(status=OrderStatus.NEW)
    build_order_item(order, {
        'is_custom': False, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 2, 'placements': [],
    })

    without_filter = admin_client.get('/api/v1/admin/production/summary')
    assert without_filter.data == []

    with_filter = admin_client.get('/api/v1/admin/production/summary', {'status': 'NEW'})
    assert len(with_filter.data) == 1
    assert with_filter.data[0]['quantity'] == 2


def test_production_summary_filtered_by_created_date_range(admin_client, motif, product_type, cut, color):
    old_order = _order(order_number='TRK-2026-7002', created_at=timezone.now() - timedelta(days=10))
    build_order_item(old_order, {
        'is_custom': False, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1, 'placements': [],
    })

    today = timezone.now().date()
    response = admin_client.get('/api/v1/admin/production/summary', {'createdFrom': str(today), 'createdTo': str(today)})

    assert response.data == []


def test_production_placements_lists_custom_print_files(admin_client, product_type, cut, color, print_area):
    order = _order()
    build_order_item(order, {
        'is_custom': True, 'motif': None, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1,
        'placements': [{
            'print_area': print_area, 'url': 'https://files.example/design.png',
            'x': 0, 'y': 0, 'width': 100, 'height': 100, 'rotation_deg': 0,
        }],
    })

    response = admin_client.get('/api/v1/admin/production/placements')

    assert response.status_code == 200
    assert len(response.data) == 1
    row = response.data[0]
    assert row['order_number'] == order.order_number
    assert row['print_area'] == print_area.name
    assert row['url'] == 'https://files.example/design.png'
    assert row['width'] == 100
    assert row['height'] == 100


def test_production_placements_filtered_by_print_area(admin_client, product_type, cut, color, print_area):
    from catalog.models import PrintArea

    other_area = PrintArea.objects.create(product_type=product_type, name='Záda', width_mm=200, height_mm=200)
    order = _order()
    build_order_item(order, {
        'is_custom': True, 'motif': None, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1,
        'placements': [
            {'print_area': print_area, 'url': 'a.png', 'x': 0, 'y': 0, 'width': 10, 'height': 10, 'rotation_deg': 0},
            {'print_area': other_area, 'url': 'b.png', 'x': 0, 'y': 0, 'width': 10, 'height': 10, 'rotation_deg': 0},
        ],
    })

    response = admin_client.get('/api/v1/admin/production/placements', {'printArea': str(print_area.id)})

    assert len(response.data) == 1
    assert response.data[0]['url'] == 'a.png'


def test_production_placements_filtered_by_status_and_date_range(admin_client, product_type, cut, color, print_area):
    quote_order = _order(status=OrderStatus.QUOTE_REQUESTED, order_number='TRK-2026-7003')
    build_order_item(quote_order, {
        'is_custom': True, 'motif': None, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1,
        'placements': [{'print_area': print_area, 'url': 'a.png', 'x': 0, 'y': 0, 'width': 10, 'height': 10, 'rotation_deg': 0}],
    })

    by_status = admin_client.get('/api/v1/admin/production/placements', {'status': 'PAID,PROCESSING'})
    assert by_status.data == []

    by_status_match = admin_client.get('/api/v1/admin/production/placements', {'status': 'QUOTE_REQUESTED'})
    assert len(by_status_match.data) == 1

    today = timezone.now().date()
    tomorrow = today + timedelta(days=1)
    by_date = admin_client.get(
        '/api/v1/admin/production/placements',
        {'status': 'QUOTE_REQUESTED', 'createdFrom': str(today), 'createdTo': str(tomorrow)},
    )
    assert len(by_date.data) == 1
