import pytest
from rest_framework.test import APIClient
from accounts.models import User
from catalog.models import MotifVariant
from orders.models import Order, OrderItem
from django.core.files.uploadedfile import SimpleUploadedFile
from io import BytesIO
from PIL import Image

from core.tokens import sign_file_token
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


def test_cart_validate_custom_item_requires_quote_and_is_unpriced(product_type, cut, color, print_area):
    file_token = sign_file_token({'url': 'https://files.example/a.png', 'mime_type': 'image/png', 'size': 100})
    body = {
        'items': [{
            'isCustom': True, 'productTypeId': str(product_type.id), 'cutId': str(cut.id),
            'colorId': str(color.id), 'size': 'L', 'quantity': 1,
            'placements': [{
                'printAreaId': str(print_area.id), 'fileToken': file_token,
                'x': 0, 'y': 0, 'width': 100, 'height': 100,
            }],
        }],
    }

    response = APIClient().post('/api/v1/cart/validate', body, format='json')

    assert response.status_code == 200
    assert response.data['requires_quote'] is True
    assert response.data['subtotal'] is None
    assert response.data['total'] is None
    assert response.data['items'][0]['valid'] is True
    assert response.data['items'][0]['unit_price'] is None


def _png_bytes():
    from io import BytesIO
    from PIL import Image
    buffer = BytesIO()
    Image.new('RGB', (20, 10), color='blue').save(buffer, format='PNG')
    return buffer.getvalue()


def test_upload_design_without_file_returns_400():
    response = APIClient().post('/api/v1/uploads/designs', {}, format='multipart')

    assert response.status_code == 400


def test_upload_design_too_large_returns_413(settings):
    from django.core.files.uploadedfile import SimpleUploadedFile

    oversized = SimpleUploadedFile('design.png', b'x' * (20 * 1024 * 1024 + 1), content_type='image/png')
    response = APIClient().post('/api/v1/uploads/designs', {'file': oversized}, format='multipart')

    assert response.status_code == 413


def test_upload_design_unsupported_type_returns_422():
    from django.core.files.uploadedfile import SimpleUploadedFile

    fake = SimpleUploadedFile('design.exe', b'not a real image', content_type='application/octet-stream')
    response = APIClient().post('/api/v1/uploads/designs', {'file': fake}, format='multipart')

    assert response.status_code == 422
    assert response.data['error']['code'] == 'UNSUPPORTED_FILE_TYPE'


def test_upload_design_png_success(tmp_path, settings):
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    png = SimpleUploadedFile('design.png', _png_bytes(), content_type='image/png')

    response = APIClient().post('/api/v1/uploads/designs', {'file': png}, format='multipart')

    assert response.status_code == 201
    assert response.data['width_px'] == 20
    assert response.data['height_px'] == 10
    assert response.data['file_token']


def test_upload_design_svg_is_sanitized(tmp_path, settings):
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    upload = SimpleUploadedFile('design.svg', svg, content_type='image/svg+xml')

    response = APIClient().post('/api/v1/uploads/designs', {'file': upload}, format='multipart')

    assert response.status_code == 201
    assert response.data['mime_type'] == 'image/svg+xml'
    assert response.data['width_px'] is None  # SVG has no pixel dimensions
    saved_path = tmp_path / response.data['url'].split('/media/', 1)[-1]
    assert b'<script' not in saved_path.read_bytes()


def test_upload_design_svg_strips_quoted_event_handler(tmp_path, settings):
    """on* event-handler attributes are dropped unconditionally by the
    allowlist walker, regardless of attribute quoting style (unlike the old
    regex sanitizer, which only matched quoted values - but an unquoted
    attribute like `onload=alert(1)` isn't valid XML in the first place, so
    that specific bypass is now rejected outright at parse time instead,
    see test_upload_design_invalid_svg_returns_422).
    """
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>'
    upload = SimpleUploadedFile('design.svg', svg, content_type='image/svg+xml')

    response = APIClient().post('/api/v1/uploads/designs', {'file': upload}, format='multipart')

    assert response.status_code == 201
    saved_path = tmp_path / response.data['url'].split('/media/', 1)[-1]
    assert b'onload' not in saved_path.read_bytes().lower()


def test_upload_design_svg_strips_javascript_href(tmp_path, settings):
    """Regression test: the old sanitizer only stripped http(s) hrefs,
    leaving javascript: URIs untouched.
    """
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    svg = (
        b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
        b'<a xlink:href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>'
    )
    upload = SimpleUploadedFile('design.svg', svg, content_type='image/svg+xml')

    response = APIClient().post('/api/v1/uploads/designs', {'file': upload}, format='multipart')

    assert response.status_code == 201
    saved_path = tmp_path / response.data['url'].split('/media/', 1)[-1]
    content = saved_path.read_bytes().lower()
    assert b'javascript:' not in content
    assert b'<a' not in content  # <a> isn't on the allowlist at all


def test_upload_design_svg_strips_style_element(tmp_path, settings):
    """Regression test: <style>@import url(...)</style> wasn't targeted by
    any of the old sanitizer's three regexes at all.
    """
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    svg = (
        b'<svg xmlns="http://www.w3.org/2000/svg">'
        b'<style>@import url(http://evil.example/x.css);</style>'
        b'<rect width="10" height="10"/></svg>'
    )
    upload = SimpleUploadedFile('design.svg', svg, content_type='image/svg+xml')

    response = APIClient().post('/api/v1/uploads/designs', {'file': upload}, format='multipart')

    assert response.status_code == 201
    saved_path = tmp_path / response.data['url'].split('/media/', 1)[-1]
    content = saved_path.read_bytes().lower()
    assert b'@import' not in content
    assert b'<style' not in content


def test_upload_design_invalid_svg_returns_422():
    from django.core.files.uploadedfile import SimpleUploadedFile

    upload = SimpleUploadedFile('design.svg', b'<svg xmlns="x"><unclosed></svg>', content_type='image/svg+xml')

    response = APIClient().post('/api/v1/uploads/designs', {'file': upload}, format='multipart')

    assert response.status_code == 422
    assert response.data['error']['code'] == 'UNSUPPORTED_FILE_TYPE'
