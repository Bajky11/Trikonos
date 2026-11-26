from unittest.mock import patch
from urllib.parse import urlencode

import pytest
import requests
from rest_framework.test import APIClient

from core.tokens import sign_file_token
from orders.models import ComgatePayment, Order
from .test_order_create_view import _order_body


pytestmark = pytest.mark.django_db
TX = 'AB12-CD34-EF56'
REDIRECT = f'https://pay1.comgate.cz/{TX}'
PUSH = '/api/v1/payments/comgate/push'


@pytest.fixture
def card_body(settings, motif, product_type, cut, color):
    settings.COMGATE_TEST_ENABLED = True
    settings.COMGATE_MERCHANT = '123456'
    settings.COMGATE_SECRET = 'test-only'
    body = _order_body(motif, product_type, cut, color, delivery={'deliveryType': 'PERSONAL_PICKUP'}, unit_price=1)
    body.update(paymentMethod='CARD_ONLINE', expectedTotal=motif.price + product_type.price)
    return body


def create_order(client, card_body):
    response = client.post('/api/v1/orders', card_body, format='json')
    assert response.status_code == 201, response.data
    return f"/api/v1/orders/access/{response.data['access_token']}/card-payment", Order.objects.get()


def test_disabled_card_not_advertised_or_accepted(card_body, settings):
    settings.COMGATE_SECRET = ''
    client = APIClient()
    assert 'CARD_ONLINE' not in {entry['value'] for entry in client.get('/api/v1/config').data['payment_methods']}
    assert client.post('/api/v1/orders', card_body, format='json').status_code == 400
    assert not Order.objects.exists()


def test_card_only_for_catalog_and_confirmed_price(card_body, print_area):
    client = APIClient()
    card_body['expectedTotal'] += 1
    assert client.post('/api/v1/orders', card_body, format='json').status_code == 422
    card_body['items'][0].update(isCustom=True, placements=[{
        'printAreaId': str(print_area.pk), 'fileToken': sign_file_token({'url': '/media/design.png'}),
        'x': 0, 'y': 0, 'width': 10, 'height': 10,
    }])
    card_body['items'][0].pop('motifId')
    assert client.post('/api/v1/orders', card_body, format='json').status_code == 400
    assert not Order.objects.exists()


def test_create_is_idempotent_and_push_only_updates_the_test_payment(card_body):
    client = APIClient()
    assert 'CARD_ONLINE' in {entry['value'] for entry in client.get('/api/v1/config').data['payment_methods']}
    url, order = create_order(client, card_body)
    assert client.get(url).data == {'state': 'NOT_STARTED'}
    assert client.post('/api/v1/orders/access/invalid/card-payment').status_code == 404
    notification = {'transId': TX, 'merchant': '123456', 'test': 'true', 'status': 'PAID', 'secret': 'test-only'}

    def push(**overrides):
        return client.post(PUSH, urlencode({**notification, **overrides}), content_type='application/x-www-form-urlencoded')

    with patch('orders.comgate.requests.post') as post:
        post.return_value.status_code = 201
        post.return_value.content = f'code=0&transId={TX}&redirect={REDIRECT}'.encode()
        assert client.post(url).data == {'state': 'PENDING', 'redirect_url': REDIRECT}
        assert client.post(url).data['redirect_url'] == REDIRECT
        post.assert_called_once()
        assert post.call_args.kwargs['data']['test'] == 'true'
        assert post.call_args.kwargs['data']['price'] == order.total == card_body['expectedTotal']
        assert push(secret='wrong').status_code == 403
        post.assert_called_once()

        post.return_value.status_code = 200
        post.return_value.content = (
            f'code=0&merchant=123456&test=true&curr=CZK&refId={order.order_number}&transId={TX}&status=PAID'
        ).encode()
        assert push().status_code == 503  # Missing price: push alone proves nothing.
        assert ComgatePayment.objects.get().state == 'PENDING'
        post.return_value.content += f'&price={order.total}'.encode()
        assert push().status_code == 204
        assert push().status_code == 204
        assert post.call_count == 3
        assert client.get(url).data == {'state': 'PAID'}
    order.refresh_from_db()
    assert order.payment_status == 'PENDING'
    assert order.status == 'NEW'


def test_create_timeout_does_not_create_another_payment(card_body):
    client = APIClient()
    url, _ = create_order(client, card_body)
    with patch('orders.comgate.requests.post', side_effect=requests.Timeout) as post:
        assert client.post(url).status_code == 503
        assert client.post(url).data == {'state': 'UNKNOWN'}
        post.assert_called_once()


@pytest.mark.parametrize('url', ['http://pay1.comgate.cz/x', 'https://comgate.cz.evil.example/x', 'https://comgate.cz@evil.example/x'])
def test_untrusted_redirect(url):
    from orders.comgate import valid_redirect

    assert not valid_redirect(url)
