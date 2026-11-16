import pytest
from rest_framework.test import APIClient
from accounts.models import User
from catalog.models import MotifVariant
from orders.models import Order, OrderItem

from orders.models import DeliveryType
from shipping.models import ShippingPrice

pytestmark = pytest.mark.django_db


def _cart_body(motif, product_type, cut, color, **extra):
    body = {
        'items': [{
            'isCustom': False, 'motifId': str(motif.id), 'productTypeId': str(product_type.id),
            'cutId': str(cut.id), 'colorId': str(color.id), 'size': 'M', 'quantity': 1,
        }],
    }
    body.update(extra)
    return body


def test_cart_validate_without_delivery_choice_returns_null_shipping_cost(motif, product_type, cut, color):
    client = APIClient()

    response = client.post('/api/v1/cart/validate', _cart_body(motif, product_type, cut, color), format='json')

    assert response.status_code == 200
    assert response.data['shipping_cost'] is None
    assert response.data['total'] is None


def test_cart_validate_with_configured_delivery_returns_shipping_cost(motif, product_type, cut, color, carrier):
    ShippingPrice.objects.create(carrier=carrier, delivery_type=DeliveryType.HOME_DELIVERY, price=5000)
    client = APIClient()
    body = _cart_body(
        motif, product_type, cut, color,
        carrierId=str(carrier.id), deliveryType=DeliveryType.HOME_DELIVERY,
    )

    response = client.post('/api/v1/cart/validate', body, format='json')

    assert response.status_code == 200
    assert response.data['shipping_cost'] == 5000
    assert response.data['total'] == motif.price + product_type.price + 5000


def test_cart_validate_personal_pickup_is_free_without_carrier(motif, product_type, cut, color):
    client = APIClient()
    body = _cart_body(motif, product_type, cut, color, deliveryType=DeliveryType.PERSONAL_PICKUP)

    response = client.post('/api/v1/cart/validate', body, format='json')

    assert response.status_code == 200
    assert response.data['shipping_cost'] == 0
    assert response.data['total'] == motif.price + product_type.price


def test_cart_preview_ignores_client_price_and_supports_anonymous_and_session_csrf(motif, product_type, cut, color):
    MotifVariant.objects.get_or_create(motif=motif, product_type=product_type, cut=cut, color=color, size='M')
    client = APIClient(enforce_csrf_checks=True)
    body = _cart_body(motif, product_type, cut, color)
    body['items'][0]['unitPrice'] = 1
    before = (Order.objects.count(), OrderItem.objects.count())
    anonymous = client.post('/api/v1/cart/validate', body, format='json')
    assert anonymous.status_code == 200
    assert anonymous.json()['items'][0]['unitPrice'] == motif.price + product_type.price
    user = User.objects.create_user(email='cart-admin@example.cz', password='test-only')
    client.force_login(user)
    assert client.post('/api/v1/cart/validate', body, format='json').status_code == 403
    token = client.get('/api/v1/admin/auth/csrf')['X-CSRFToken']
    authenticated = client.post('/api/v1/cart/validate', body, format='json', HTTP_X_CSRFTOKEN=token)
    assert authenticated.status_code == 200
    assert authenticated.json()['subtotal'] == motif.price + product_type.price
    assert authenticated.json()['shippingCost'] is None
    assert authenticated.json()['total'] is None
    assert (Order.objects.count(), OrderItem.objects.count()) == before


def test_cart_preview_reports_unavailable_variant_and_rejects_deleted_reference(motif, product_type, cut, color):
    MotifVariant.objects.get_or_create(motif=motif, product_type=product_type, cut=cut, color=color, size='M')
    MotifVariant.objects.filter(motif=motif, size='L').delete()
    client = APIClient()
    body = _cart_body(motif, product_type, cut, color)
    body['items'].append({**body['items'][0], 'size': 'L'})
    result = client.post('/api/v1/cart/validate', body, format='json')
    assert result.status_code == 200
    assert result.json()['items'][0]['valid'] is True
    assert result.json()['items'][1]['valid'] is False
    assert result.json()['items'][1]['errors']
    assert result.json()['subtotal'] is None
    body['items'][1]['motifId'] = '00000000-0000-0000-0000-000000000000'
    assert client.post('/api/v1/cart/validate', body, format='json').status_code == 400
