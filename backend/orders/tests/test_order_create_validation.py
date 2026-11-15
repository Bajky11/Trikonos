"""POST /orders field-level validation for billing (IČO/PSČ) and delivery
(carrier/pickup point) rules - orders.serializers.BillingInputSerializer and
DeliveryInputSerializer, exercised through the real public checkout endpoint.
"""
import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def _body(motif, product_type, cut, color, *, billing=None, delivery=None):
    body = {
        'customer': {'email': 'jana@example.cz', 'firstName': 'Jana', 'lastName': 'Nováková'},
        'billing': billing or {'fullName': 'Jana Nováková', 'street': 'Horní 12', 'city': 'Vrchlabí', 'zip': '54301'},
        'shipping': {'sameAsBilling': True},
        'delivery': delivery or {'deliveryType': 'PERSONAL_PICKUP'},
        'paymentMethod': 'BANK_TRANSFER',
        'termsAccepted': True,
        'items': [{
            'isCustom': False, 'motifId': str(motif.id), 'productTypeId': str(product_type.id),
            'cutId': str(cut.id), 'colorId': str(color.id), 'size': 'M', 'quantity': 1,
        }],
    }
    return body


def test_ico_must_have_8_digits(motif, product_type, cut, color):
    body = _body(motif, product_type, cut, color, billing={
        'fullName': 'Firma s.r.o.', 'companyName': 'Firma s.r.o.', 'ico': '123', 'street': 'Horní 12',
        'city': 'Vrchlabí', 'zip': '54301',
    })

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 400
    assert 'billing.ico' in response.data['error']['fields']


def test_ico_requires_company_name(motif, product_type, cut, color):
    body = _body(motif, product_type, cut, color, billing={
        'fullName': 'Firma s.r.o.', 'ico': '12345678', 'street': 'Horní 12', 'city': 'Vrchlabí', 'zip': '54301',
    })

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 400
    assert 'billing.company_name' in response.data['error']['fields']


def test_czech_zip_must_have_5_digits(motif, product_type, cut, color):
    body = _body(motif, product_type, cut, color, billing={
        'fullName': 'Jana Nováková', 'street': 'Horní 12', 'city': 'Vrchlabí', 'zip': '123',
    })

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 400
    assert 'billing.zip' in response.data['error']['fields']


def test_personal_pickup_must_not_have_a_carrier(motif, product_type, cut, color, carrier):
    body = _body(motif, product_type, cut, color, delivery={
        'deliveryType': 'PERSONAL_PICKUP', 'carrierId': str(carrier.id),
    })

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 400
    assert 'delivery.non_field_errors' in response.data['error']['fields']


def test_non_personal_delivery_requires_a_carrier(motif, product_type, cut, color):
    body = _body(motif, product_type, cut, color, delivery={'deliveryType': 'PICKUP_POINT'})

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 400
    assert 'delivery.non_field_errors' in response.data['error']['fields']


def test_pickup_point_requires_id_and_name(motif, product_type, cut, color, carrier):
    body = _body(motif, product_type, cut, color, delivery={
        'deliveryType': 'PICKUP_POINT', 'carrierId': str(carrier.id),
    })

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 400
    assert 'delivery.non_field_errors' in response.data['error']['fields']


def test_terms_must_be_accepted_on_public_checkout(motif, product_type, cut, color):
    body = _body(motif, product_type, cut, color)
    body['termsAccepted'] = False

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 400
    assert 'terms_accepted' in response.data['error']['fields']


def test_empty_items_list_returns_400(motif, product_type, cut, color):
    body = _body(motif, product_type, cut, color)
    body['items'] = []

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 400
    assert 'items' in response.data['error']['fields']


def test_different_shipping_address_requires_all_fields(motif, product_type, cut, color):
    body = _body(motif, product_type, cut, color)
    body['shipping'] = {'sameAsBilling': False, 'fullName': 'Jana Nováková'}  # missing street/city/zip

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 400
    assert 'shipping' in response.data['error']['fields']


def test_different_shipping_address_with_all_fields_is_used_instead_of_billing(motif, product_type, cut, color):
    from orders.models import Order

    body = _body(motif, product_type, cut, color)
    body['shipping'] = {
        'sameAsBilling': False, 'fullName': 'Petr Novák', 'street': 'Dolní 5', 'city': 'Praha', 'zip': '11000',
    }

    response = APIClient().post('/api/v1/orders', body, format='json')

    assert response.status_code == 201
    order = Order.objects.get(order_number=response.data['order_number'])
    assert order.shipping_full_name == 'Petr Novák'
    assert order.shipping_street == 'Dolní 5'
    assert order.shipping_city == 'Praha'
