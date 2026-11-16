import pytest
from rest_framework.test import APIClient
from accounts.models import User
from catalog.models import MotifVariant
from orders.models import Order, OrderItem
from django.core.files.uploadedfile import SimpleUploadedFile
from io import BytesIO
from PIL import Image

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


def test_design_upload_and_custom_cart_require_session_csrf_and_do_not_create_orders(print_area, cut, color, settings, tmp_path, monkeypatch):
    settings.MEDIA_ROOT = tmp_path
    client = APIClient(enforce_csrf_checks=True)
    user = User.objects.create_user(email='design-admin@example.cz', password='test-only')
    client.force_login(user)
    buffer = BytesIO()
    Image.new('RGB', (200, 100), color='red').save(buffer, format='PNG')
    def image():
        return SimpleUploadedFile('design.png', buffer.getvalue(), content_type='image/png')
    assert client.post('/api/v1/uploads/designs', {'file': image()}, format='multipart').status_code == 403
    token = client.get('/api/v1/admin/auth/csrf')['X-CSRFToken']
    assert client.post('/api/v1/uploads/designs', {}, format='multipart', HTTP_X_CSRFTOKEN=token).status_code == 400
    unsupported = client.post('/api/v1/uploads/designs', {'file': SimpleUploadedFile('fake.txt', b'not an image')}, format='multipart', HTTP_X_CSRFTOKEN=token)
    assert unsupported.status_code == 422
    with monkeypatch.context() as limits:
        limits.setattr('orders.views.DesignUploadView.MAX_SIZE', 1)
        assert client.post('/api/v1/uploads/designs', {'file': image()}, format='multipart', HTTP_X_CSRFTOKEN=token).status_code == 413
    damaged = client.post('/api/v1/uploads/designs', {'file': SimpleUploadedFile('broken.png', b'\x89PNG\r\n\x1a\nnot-an-image')}, format='multipart', HTTP_X_CSRFTOKEN=token)
    assert damaged.status_code == 422
    jpeg = BytesIO()
    Image.new('RGB', (200, 100), color='red').save(jpeg, format='JPEG')
    truncated = client.post('/api/v1/uploads/designs', {'file': SimpleUploadedFile('broken.jpg', jpeg.getvalue()[:-10], content_type='image/jpeg')}, format='multipart', HTTP_X_CSRFTOKEN=token)
    assert truncated.status_code == 422
    assert not list(tmp_path.rglob('*.png'))
    response = client.post('/api/v1/uploads/designs', {'file': image()}, format='multipart', HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 201
    uploaded = response.json()
    assert (uploaded['widthPx'], uploaded['heightPx']) == (200, 100)
    assert uploaded['mimeType'] == 'image/png'
    assert len(list(tmp_path.rglob('*.png'))) == 1
    body = {'items': [{
        'isCustom': True, 'productTypeId': str(print_area.product_type_id), 'cutId': str(cut.id), 'colorId': str(color.id), 'size': 'M', 'quantity': 2,
        'placements': [{'printAreaId': str(print_area.id), 'fileToken': uploaded['fileToken'], 'x': 0, 'y': 0, 'width': 200, 'height': 100}],
    }]}
    valid = client.post('/api/v1/cart/validate', body, format='json', HTTP_X_CSRFTOKEN=token)
    assert valid.status_code == 200
    assert valid.json()['items'][0]['valid'] is True
    assert valid.json()['items'][0]['unitPrice'] is None
    assert valid.json()['subtotal'] is None
    assert valid.json()['requiresQuote'] is True
    assert not Order.objects.exists()
    monkeypatch.setattr('core.tokens.FILE_TOKEN_MAX_AGE', -1)
    expired = client.post('/api/v1/cart/validate', body, format='json', HTTP_X_CSRFTOKEN=token)
    assert expired.status_code == 422
    assert expired.json()['error']['code'] == 'INVALID_FILE_TOKEN'
