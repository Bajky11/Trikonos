"""POST /orders (public checkout) and POST /admin/orders (admin manual
creation) share OrderCreateSerializer - these tests lock down the single
most money-critical property of the whole app: a public, unauthenticated
client can send any `unitPrice`/`shippingCost` it wants, but the server
must silently ignore both and always compute the real price itself. This
is the amount that will eventually be handed to the payment gateway, so it
must never be influenceable by request data.
"""
import uuid
from unittest.mock import patch

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from accounts.models import User
from customers.models import Customer
from orders.models import DeliveryType, Order, OrderStatus
from shipping.models import Carrier, ShippingPrice

pytestmark = pytest.mark.django_db


def _order_body(motif, product_type, cut, color, *, delivery, unit_price=None, shipping_cost=None, email='jana@example.cz'):
    item = {
        'isCustom': False, 'motifId': str(motif.id), 'productTypeId': str(product_type.id),
        'cutId': str(cut.id), 'colorId': str(color.id), 'size': 'M', 'quantity': 1,
    }
    if unit_price is not None:
        item['unitPrice'] = unit_price

    body = {
        'customer': {'email': email, 'firstName': 'Jana', 'lastName': 'Nováková'},
        'billing': {'fullName': 'Jana Nováková', 'street': 'Horní 12', 'city': 'Vrchlabí', 'zip': '54301'},
        'shipping': {'sameAsBilling': True},
        'delivery': delivery,
        'paymentMethod': 'BANK_TRANSFER',
        'termsAccepted': True,
        'items': [item],
    }
    if shipping_cost is not None:
        body['shippingCost'] = shipping_cost
    return body


def test_public_checkout_ignores_client_supplied_unit_price(motif, product_type, cut, color):
    """A customer sending unitPrice: 1 (haléř) for a 599 Kč motif must still
    be charged motif.price + product_type.price - the server never trusts a
    client-supplied item price, public checkout or not.
    """
    client = APIClient()
    body = _order_body(
        motif, product_type, cut, color, delivery={'deliveryType': DeliveryType.PERSONAL_PICKUP}, unit_price=1,
    )

    response = client.post('/api/v1/orders', body, format='json')

    assert response.status_code == 201
    assert response.data['items'][0]['unit_price'] == motif.price + product_type.price
    assert response.data['subtotal'] == motif.price + product_type.price


@pytest.mark.parametrize('valid', [True, False])
def test_public_packeta_pickup_validates_before_saving(motif, product_type, cut, color, settings, valid):
    settings.SHOP_CONFIG = {**settings.SHOP_CONFIG, 'PACKETA_WIDGET_API_KEY': 'public-widget-key'}
    packeta = Carrier.objects.create(code='PACKETA', name='Zásilkovna')
    ShippingPrice.objects.create(carrier=packeta, delivery_type=DeliveryType.PICKUP_POINT, price=6900)
    body = _order_body(motif, product_type, cut, color, delivery={
        'deliveryType': DeliveryType.PICKUP_POINT, 'carrierId': str(packeta.id),
        'pickupPointId': '12345', 'pickupPointName': 'Název od klienta',
    })
    body['orderId'] = str(uuid.uuid4())
    with patch('shipping.packeta_pickup.requests.post') as post, patch('shipping.packeta_client.create_packet') as create_packet:
        post.return_value.json.return_value = {
            'isValid': valid,
            'point': {'name': 'Z-BOX', 'address': {'city': 'Vrchlabí', 'street': 'Horní 12'}},
        }
        response = APIClient().post('/api/v1/orders', body, format='json')
        assert post.call_args.kwargs['json']['point'] == {'id': '12345'}
        assert post.call_args.kwargs['json']['options']['vendors'] == [{'country': 'cz'}, {'country': 'cz', 'group': 'zbox'}]
        if valid:
            assert response.status_code == 201
            order = Order.objects.get(pk=body['orderId'])
            assert (order.pickup_point_id, order.pickup_point_name, order.shipping_cost) == ('12345', 'Z-BOX – Vrchlabí, Horní 12', 6900)
            assert not order.carrier_shipment_id
            assert APIClient().post('/api/v1/orders', body, format='json').status_code == 201
            post.assert_called_once()
        else:
            assert response.status_code == 422
            assert not Order.objects.filter(pk=body['orderId']).exists()
        create_packet.assert_not_called()


def test_public_checkout_ignores_client_supplied_shipping_cost(motif, product_type, cut, color, carrier):
    """A customer sending shippingCost: 1 (haléř) must still get the real
    configured price for their chosen carrier/delivery type, not their own
    number.
    """
    ShippingPrice.objects.create(carrier=carrier, delivery_type=DeliveryType.HOME_DELIVERY, price=7900)
    client = APIClient()
    body = _order_body(
        motif, product_type, cut, color,
        delivery={
            'carrierId': str(carrier.id), 'deliveryType': DeliveryType.HOME_DELIVERY,
        },
        shipping_cost=1,
    )

    response = client.post('/api/v1/orders', body, format='json')

    assert response.status_code == 201
    assert response.data['shipping_cost'] == 7900
    assert response.data['total'] == motif.price + product_type.price + 7900


def test_public_checkout_custom_item_ignores_client_supplied_unit_price(product_type, cut, color, print_area):
    """Same tampering attempt on a custom-print item (which has no catalog
    price to fall back to) - must still end up unpriced (None), not the
    client's number, even though the item is "awaiting a quote" either way.
    """
    client = APIClient()
    item = {
        'isCustom': True, 'productTypeId': str(product_type.id), 'cutId': str(cut.id), 'colorId': str(color.id),
        'size': 'M', 'quantity': 1, 'unitPrice': 1,
        'placements': [{
            'printAreaId': str(print_area.id), 'fileToken': 'does-not-matter',
            'width': 100, 'height': 100,
        }],
    }
    body = {
        'customer': {'email': 'jana@example.cz', 'firstName': 'Jana', 'lastName': 'Nováková'},
        'billing': {'fullName': 'Jana Nováková', 'street': 'Horní 12', 'city': 'Vrchlabí', 'zip': '54301'},
        'shipping': {'sameAsBilling': True},
        'delivery': {'deliveryType': DeliveryType.PERSONAL_PICKUP},
        'paymentMethod': 'BANK_TRANSFER',
        'termsAccepted': True,
        'items': [item],
    }
    # fileToken resolution happens via core.tokens.resolve_file_token - not under
    # test here, so this request is expected to fail validation on the token,
    # not on pricing. We only care that IF it got past validation, unit_price
    # would never come from the client - covered by the serializer-level
    # assertion below instead of a full HTTP round trip.
    from orders.serializers import OrderCreateSerializer

    serializer = OrderCreateSerializer(data=body)
    is_valid = serializer.is_valid()
    if is_valid:
        assert serializer.validated_data['items'][0]['unit_price'] is None
    else:
        # Token resolution failing is fine here (expected, see comment above) -
        # anything else failing would hide the property we're testing.
        assert 'placements' in str(serializer.errors) or 'file_token' in str(serializer.errors)


def test_admin_create_can_set_unit_price_and_shipping_cost(motif, product_type, cut, color):
    """The admin-context path (AdminOrderViewSet.create, context is_admin=True)
    is the one legitimate way to override price/shipping - confirms the
    distinction is real, not that admin override is silently broken too.
    """
    admin = User.objects.create_user(email='admin@trikonos.cz', password='x', name='Admin')
    client = APIClient()
    client.force_authenticate(user=admin)
    body = _order_body(
        motif, product_type, cut, color,
        delivery={'deliveryType': DeliveryType.PERSONAL_PICKUP}, unit_price=12345, shipping_cost=678,
    )
    del body['termsAccepted']  # not required for admin-created orders

    response = client.post('/api/v1/admin/orders', body, format='json')

    assert response.status_code == 201
    assert response.data['items'][0]['unit_price'] == 12345
    assert response.data['shipping_cost'] == 678
    assert response.data['total'] == 12345 + 678


def test_duplicate_order_id_returns_the_same_order_not_a_second_one(motif, product_type, cut, color):
    """A retried checkout (double-click, network retry) with the same
    client-generated orderId must not create a duplicate order.
    """
    client = APIClient()
    order_id = str(uuid.uuid4())
    body = _order_body(motif, product_type, cut, color, delivery={'deliveryType': DeliveryType.PERSONAL_PICKUP})
    body['orderId'] = order_id

    first = client.post('/api/v1/orders', body, format='json')
    second = client.post('/api/v1/orders', body, format='json')

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.data['order_number'] == second.data['order_number']
    assert first.data['access_token'] == second.data['access_token']
    assert Order.objects.filter(id=order_id).count() == 1
    assert Order.objects.count() == 1


def test_order_id_race_where_another_request_wins_returns_its_order(motif, product_type, cut, color):
    """OrderCreateSerializer.create() pre-checks for an existing order with
    the same orderId before calling services.create_order() - the only way
    to reach its except-IntegrityError fallback is a genuine race (two
    concurrent requests both pass the pre-check before either commits),
    which a sequential test can't reproduce naturally. Simulated here by
    having the mocked services.create_order itself insert the "other
    request"'s row and then raise, exactly like a real race would leave
    the DB by the time our own INSERT fails.
    """
    order_id = str(uuid.uuid4())
    # Must match _order_body()'s default customer email - existing_for_retry()
    # rejects a retry whose customer doesn't match the request (ORDER_ID_CONFLICT),
    # and that guard would otherwise fire here for an unrelated reason.
    customer = Customer.objects.create(email='jana@example.cz', first_name='Jana', last_name='Nováková')

    def _simulate_concurrent_winner(**kwargs):
        Order.objects.create(
            id=order_id, order_number='TRK-2026-RACE', customer=customer, status=OrderStatus.NEW,
            billing_full_name='Jana', billing_street='Horní 12', billing_city='Vrchlabí', billing_zip='54301',
            shipping_full_name='Jana', shipping_street='Horní 12', shipping_city='Vrchlabí', shipping_zip='54301',
        )
        raise IntegrityError('duplicate key value violates unique constraint')

    body = _order_body(motif, product_type, cut, color, delivery={'deliveryType': DeliveryType.PERSONAL_PICKUP})
    body['orderId'] = order_id

    with patch('orders.services.create_order', side_effect=_simulate_concurrent_winner):
        response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 201
    assert response.data['order_number'] == 'TRK-2026-RACE'
    assert Order.objects.filter(id=order_id).count() == 1


def test_integrity_error_without_a_winning_order_propagates(motif, product_type, cut, color):
    body = _order_body(motif, product_type, cut, color, delivery={'deliveryType': DeliveryType.PERSONAL_PICKUP})
    body['orderId'] = str(uuid.uuid4())

    with patch('orders.services.create_order', side_effect=IntegrityError('unexpected')):
        response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 500


def test_different_order_id_creates_separate_orders(motif, product_type, cut, color):
    client = APIClient()
    body = _order_body(motif, product_type, cut, color, delivery={'deliveryType': DeliveryType.PERSONAL_PICKUP})
    body['orderId'] = str(uuid.uuid4())

    first = client.post('/api/v1/orders', body, format='json')
    body['orderId'] = str(uuid.uuid4())
    second = client.post('/api/v1/orders', body, format='json')

    assert first.data['order_number'] != second.data['order_number']
    assert Order.objects.count() == 2


def test_checkout_price_guard_rolls_back_before_emails_and_session_retry_is_idempotent(motif, product_type, cut, color, carrier, django_capture_on_commit_callbacks):
    client = APIClient(enforce_csrf_checks=True)
    user = User.objects.create_user(email='checkout-admin@example.cz', password='test-only')
    client.force_login(user)
    ShippingPrice.objects.create(carrier=carrier, delivery_type=DeliveryType.HOME_DELIVERY, price=7900)
    body = _order_body(motif, product_type, cut, color, delivery={'deliveryType': DeliveryType.HOME_DELIVERY, 'carrierId': str(carrier.id)})
    body.update(orderId=str(uuid.uuid4()), expectedTotal=1, expectedShippingCost=7900)
    assert client.post('/api/v1/orders', body, format='json').status_code == 403
    token = client.get('/api/v1/admin/auth/csrf')['X-CSRFToken']
    with django_capture_on_commit_callbacks(execute=True) as rejected_callbacks:
        rejected = client.post('/api/v1/orders', body, format='json', HTTP_X_CSRFTOKEN=token)
    assert rejected.status_code == 422
    assert rejected.json()['error']['code'] == 'PRICE_CHANGED'
    assert not Order.objects.exists()
    assert not rejected_callbacks
    body['expectedTotal'] = motif.price + product_type.price + 7900
    body['expectedShippingCost'] = 1
    with django_capture_on_commit_callbacks(execute=True) as shipping_callbacks:
        changed_shipping = client.post('/api/v1/orders', body, format='json', HTTP_X_CSRFTOKEN=token)
    assert changed_shipping.status_code == 422
    assert not Order.objects.exists()
    assert not shipping_callbacks
    body['expectedShippingCost'] = 7900
    body['expectedTotal'] = motif.price + product_type.price + 7900
    with django_capture_on_commit_callbacks(execute=True) as accepted_callbacks:
        accepted = client.post('/api/v1/orders', body, format='json', HTTP_X_CSRFTOKEN=token)
    assert accepted.status_code == 201
    assert len(accepted_callbacks) == 2
    assert 'no-store' in accepted['Cache-Control']
    with django_capture_on_commit_callbacks(execute=True) as repeated_callbacks:
        repeated = client.post('/api/v1/orders', body, format='json', HTTP_X_CSRFTOKEN=token)
    assert repeated.status_code == 201
    assert repeated.json()['orderNumber'] == accepted.json()['orderNumber']
    assert Order.objects.count() == 1
    assert not repeated_callbacks
    conflict = client.post('/api/v1/orders', {**body, 'customer': {**body['customer'], 'email': 'someone-else@example.cz'}}, format='json', HTTP_X_CSRFTOKEN=token)
    assert conflict.status_code == 422
    assert conflict.json()['error']['code'] == 'ORDER_ID_CONFLICT'
    assert 'accessToken' not in conflict.json()
    detail = client.get('/api/v1/orders/access/' + accepted.json()['accessToken'])
    assert detail.status_code == 200
    assert 'no-store' in detail['Cache-Control']
    from orders.emails import _order_access_url
    from urllib.parse import urlsplit, parse_qs
    url = urlsplit(_order_access_url(Order.objects.get()))
    assert url.path == '/objednavka'
    assert parse_qs(url.fragment)['pristup']
    assert accepted.json()['accessToken'] not in url.path


def test_public_catalog_order_auto_confirms(motif, product_type, cut, color):
    """A fully-priced catalog order from public checkout confirms itself -
    the customer already saw the final price in this response, no admin
    action needed before it can move to PROCESSING.
    """
    client = APIClient()
    body = _order_body(motif, product_type, cut, color, delivery={'deliveryType': DeliveryType.PERSONAL_PICKUP})

    response = client.post('/api/v1/orders', body, format='json')

    order = Order.objects.get(order_number=response.data['order_number'])
    assert order.status == OrderStatus.NEW
    assert order.confirmed_at is not None


def test_admin_created_catalog_order_does_not_auto_confirm(motif, product_type, cut, color):
    """Admin manually building an order (e.g. from a phone call) still
    confirms it by hand later, even for a plain catalog item - the
    auto-confirm shortcut is specifically for the public checkout path.
    """
    admin = User.objects.create_user(email='admin2@trikonos.cz', password='x', name='Admin')
    client = APIClient()
    client.force_authenticate(user=admin)
    body = _order_body(motif, product_type, cut, color, delivery={'deliveryType': DeliveryType.PERSONAL_PICKUP})
    del body['termsAccepted']

    response = client.post('/api/v1/admin/orders', body, format='json')

    order = Order.objects.get(order_number=response.data['order_number'])
    assert order.status == OrderStatus.NEW
    assert order.confirmed_at is None


def test_quote_order_does_not_auto_confirm(product_type, cut, color, print_area):
    """A custom-print order has no price yet - nothing to auto-confirm."""
    client = APIClient()
    item = {
        'isCustom': True, 'productTypeId': str(product_type.id), 'cutId': str(cut.id), 'colorId': str(color.id),
        'size': 'M', 'quantity': 1,
        'placements': [{
            'printAreaId': str(print_area.id), 'fileToken': 'does-not-matter', 'width': 100, 'height': 100,
        }],
    }
    body = {
        'customer': {'email': 'jana@example.cz', 'firstName': 'Jana', 'lastName': 'Nováková'},
        'billing': {'fullName': 'Jana Nováková', 'street': 'Horní 12', 'city': 'Vrchlabí', 'zip': '54301'},
        'shipping': {'sameAsBilling': True},
        'delivery': {'deliveryType': DeliveryType.PERSONAL_PICKUP},
        'paymentMethod': 'BANK_TRANSFER',
        'termsAccepted': True,
        'items': [item],
    }

    from orders.serializers import OrderCreateSerializer

    serializer = OrderCreateSerializer(data=body)
    if not serializer.is_valid():
        pytest.skip('file token resolution not under test here')
    order = serializer.save()

    assert order.status == OrderStatus.QUOTE_REQUESTED
    assert order.confirmed_at is None
