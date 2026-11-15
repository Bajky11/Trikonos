import pytest
from rest_framework.test import APIClient

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
