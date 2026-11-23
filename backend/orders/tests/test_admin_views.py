from io import BytesIO
from unittest.mock import patch

import pytest
from django.core import mail
from rest_framework.test import APIClient

from accounts.models import User
from core.exceptions import PacketaApiError
from customers.models import Customer
from orders.models import DeliveryType, Order, OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus
from orders.services import build_order_item
from shipping.models import Carrier, PacketaConfig, ShippingPrice
from shipping.packeta_client import CreatedPacket, PacketStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(email='admin@trikonos.cz', password='x', name='Admin')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def packeta_carrier(db):
    return Carrier.objects.create(code='PACKETA', name='Zásilkovna')


def _order(*, motif, product_type, cut, color, packeta_carrier, delivery_type=DeliveryType.PICKUP_POINT,
           email='jana@example.cz', order_number='TRK-2026-0001', **extra):
    customer = Customer.objects.create(
        email=email, first_name='Jana', last_name='Nováková', phone='+420777123456',
    )
    fields = {
        'order_number': order_number,
        'customer': customer,
        'status': OrderStatus.NEW,
        'subtotal': 59900, 'shipping_cost': 5000, 'total': 64900,
        'carrier': packeta_carrier,
        'delivery_type': delivery_type,
        'pickup_point_id': '131', 'pickup_point_name': 'Vrchlabí, Krkonošská',
        'payment_method': PaymentMethod.BANK_TRANSFER,
        'billing_full_name': 'Jana Nováková', 'billing_street': 'Horní 12', 'billing_city': 'Vrchlabí', 'billing_zip': '54301',
        'shipping_full_name': 'Jana Nováková', 'shipping_street': 'Horní 12', 'shipping_city': 'Vrchlabí', 'shipping_zip': '54301',
    }
    fields.update(extra)
    order = Order.objects.create(**fields)
    build_order_item(order, {
        'is_custom': False, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1, 'placements': [],
    })
    return order


def test_mixed_order_list_is_unique_and_filters_preserve_total_item_count(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)
    item = order.items.first()
    item.pk = None
    item.is_custom = True
    item.motif = None
    item.save()
    for params in [{}, {'hasCustom': 'true'}, {'q': order.order_number, 'status': 'NEW'}]:
        response = admin_client.get('/api/v1/admin/orders', params)
        assert response.status_code == 200
        assert response.data['count'] == 1
        assert response.data['results'][0]['item_count'] == 2
        assert response.data['results'][0]['has_custom'] is True
        assert 'no-store' in response['Cache-Control']
    assert admin_client.get('/api/v1/admin/orders', {'hasCustom': 'false'}).data['count'] == 0


def test_admin_shipping_changes_reprice_and_rollback_on_missing_rate(admin_client, motif, product_type, cut, color, packeta_carrier):
    from django.utils import timezone
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier, confirmed_at=timezone.now())
    base = f'/api/v1/admin/orders/{order.id}'
    response = admin_client.patch(base, {'deliveryType': 'HOME_DELIVERY'}, format='json')
    assert response.status_code == 503
    order.refresh_from_db()
    assert order.delivery_type == DeliveryType.PICKUP_POINT
    assert order.confirmed_at is not None
    ShippingPrice.objects.create(carrier=packeta_carrier, delivery_type=DeliveryType.HOME_DELIVERY, price=7900)
    response = admin_client.patch(base, {'deliveryType': 'HOME_DELIVERY'}, format='json')
    assert response.status_code == 200
    order.refresh_from_db()
    assert order.shipping_cost == 7900
    assert order.total == order.subtotal + 7900
    assert order.confirmed_at is None
    response = admin_client.patch(base, {'deliveryType': 'PERSONAL_PICKUP', 'carrierId': None}, format='json')
    assert response.status_code == 200
    assert response.data['shipping_cost'] == 0


def test_pricing_failure_rolls_back_item_and_confirm_rejects_locked_order(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)
    item = order.items.first()
    response = admin_client.patch(f'/api/v1/admin/orders/{order.id}/items/{item.id}', {'quantity': 2, 'unitPrice': 1}, format='json')
    assert response.status_code == 503
    item.refresh_from_db()
    assert item.quantity == 1
    assert item.unit_price != 1
    order.status = OrderStatus.CANCELLED
    order.save()
    with patch('orders.emails.send_order_confirmed_email') as send:
        response = admin_client.post(f'/api/v1/admin/orders/{order.id}/confirm', {}, format='json')
        assert response.status_code == 409
        assert response.data['error']['code'] == 'ORDER_LOCKED'
        send.assert_not_called()


def test_admin_quote_lifecycle_requires_session_csrf_and_respects_separate_payment_state(motif, product_type, cut, color, packeta_carrier, django_capture_on_commit_callbacks):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier, status=OrderStatus.QUOTE_REQUESTED, subtotal=None, total=None)
    item = order.items.first()
    item.unit_price = None
    item.is_custom = True
    item.motif = None
    item.save()
    client = APIClient(enforce_csrf_checks=True)
    base = f'/api/v1/admin/orders/{order.id}'
    assert client.get(base).status_code == 403
    client.force_login(User.objects.create_user(email='pricing@example.cz', password='test-only'))
    price_body = {'unitPrice': 34990, 'quantity': 1}
    assert client.patch(f'{base}/items/{item.id}', price_body, format='json').status_code == 403
    token = client.get('/api/v1/admin/auth/csrf')['X-CSRFToken']
    response = client.patch(f'{base}/items/{item.id}', price_body, format='json', HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 200
    assert response.data['total'] == 39990
    assert response.data['confirmed_at'] is None
    with patch('orders.emails.send_order_confirmed_email') as send, django_capture_on_commit_callbacks(execute=True):
        confirmed = client.post(f'{base}/confirm', {'message': 'Cena za týmový potisk.'}, format='json', HTTP_X_CSRFTOKEN=token)
    assert confirmed.status_code == 200
    assert confirmed.data['status'] == OrderStatus.NEW
    assert confirmed.data['confirmed_at']
    send.assert_called_once()
    assert send.call_args.kwargs['message'] == 'Cena za týmový potisk.'
    payment = client.patch(f'{base}/payment-status', {'paymentStatus': 'PAID'}, format='json', HTTP_X_CSRFTOKEN=token)
    assert payment.status_code == 200
    assert payment.data['status'] == OrderStatus.NEW
    assert payment.data['payment_status'] == PaymentStatus.PAID
    changed = client.post(f'{base}/status', {'status': 'PROCESSING'}, format='json', HTTP_X_CSRFTOKEN=token)
    assert changed.status_code == 200
    assert changed.data['is_locked'] is True
    assert client.patch(f'{base}/items/{item.id}', price_body, format='json', HTTP_X_CSRFTOKEN=token).status_code == 409
    assert client.patch(base, {'note': 'Must not save'}, format='json', HTTP_X_CSRFTOKEN=token).status_code == 409
    assert client.patch(base, {'trackingNumber': 'Z123456'}, format='json', HTTP_X_CSRFTOKEN=token).status_code == 200


def test_production_filters_print_sheet_and_original_use_existing_contract(admin_client, motif, product_type, cut, color, packeta_carrier, print_area):
    from orders.models import CustomDesignPlacement
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier, status=OrderStatus.PROCESSING)
    item = order.items.first()
    item.quantity = 2
    item.is_custom = True
    item.motif = None
    item.save()
    placement = CustomDesignPlacement.objects.create(order_item=item, print_area=print_area, url='/media/designs/team.png', x=10, y=20, width=100, height=80, rotation_deg=0)
    summary = admin_client.get('/api/v1/admin/production/summary', {'status': 'PROCESSING'})
    assert summary.status_code == 200
    assert summary.json()[0]['quantity'] == 2
    assert 'no-store' in summary['Cache-Control']
    placements = admin_client.get('/api/v1/admin/production/placements', {'status': 'PROCESSING', 'printArea': str(print_area.id)})
    assert placements.status_code == 200
    assert placements.json() == [{
        'orderNumber': order.order_number, 'itemLabel': item.item_label, 'printArea': print_area.name,
        'width': 100, 'height': 80, 'rotationDeg': 0, 'url': '/media/designs/team.png',
    }]
    for endpoint in ['summary', 'placements']:
        assert admin_client.get(f'/api/v1/admin/production/{endpoint}', {'status': 'NEW'}).json() == []
        assert admin_client.get(f'/api/v1/admin/production/{endpoint}', {'status': 'PROCESSING', 'createdTo': '2000-01-01'}).json() == []
        assert APIClient().get(f'/api/v1/admin/production/{endpoint}').status_code == 403
    sheet = admin_client.get(f'/api/v1/admin/orders/{order.id}/print-sheet')
    assert sheet.status_code == 200
    assert sheet.json()['items'][0]['quantity'] == 2
    assert sheet.json()['items'][0]['placements'][0]['x'] == 10
    assert 'no-store' in sheet['Cache-Control']
    download = admin_client.get(f'/api/v1/admin/orders/{order.id}/items/{item.id}/placements/{placement.id}/file')
    assert download.status_code == 302
    assert download['Location'] == placement.url
    endpoint = f'/api/v1/admin/orders/{order.id}/items/{item.id}/placements/{placement.id}'
    assert admin_client.patch(endpoint, {'width': 90}, format='json').status_code == 409
    order.status = OrderStatus.NEW
    order.save()
    changed = admin_client.patch(endpoint, {'width': 90, 'height': 60, 'x': 5, 'y': 10}, format='json')
    assert changed.status_code == 200
    assert changed.json()['items'][0]['placements'][0]['width'] == 90
    assert admin_client.patch(endpoint, {'width': 99999}, format='json').status_code == 422


def test_create_shipment_pickup_point_success(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        delivery_type=DeliveryType.PICKUP_POINT,
    )
    created = CreatedPacket(packet_id='12345', barcode='Z12345', barcode_text='Z 123 4567 890')

    with patch('shipping.packeta_client.create_packet', return_value=created) as mock_create:
        response = admin_client.post(f'/api/v1/admin/orders/{order.id}/shipment', {'weight': '0.5'}, format='json')

    assert response.status_code == 200
    assert response.data['tracking_number'] == 'Z 123 4567 890'
    assert response.data['carrier_shipment_id'] == '12345'
    order.refresh_from_db()
    assert order.carrier_shipment_id == '12345'
    assert order.tracking_number == 'Z 123 4567 890'

    sent_attributes = mock_create.call_args.kwargs['packet_attributes']
    assert sent_attributes['addressId'] == '131'
    assert 'street' not in sent_attributes


def test_create_shipment_home_delivery_success(admin_client, motif, product_type, cut, color, packeta_carrier):
    PacketaConfig.objects.update_or_create(pk=1, defaults={'home_delivery_address_id': '106'})
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        delivery_type=DeliveryType.HOME_DELIVERY, pickup_point_id='', pickup_point_name='',
    )
    created = CreatedPacket(packet_id='999', barcode='Z999', barcode_text='Z 999 0000 000')

    with patch('shipping.packeta_client.create_packet', return_value=created) as mock_create:
        response = admin_client.post(f'/api/v1/admin/orders/{order.id}/shipment', {'weight': '1.2'}, format='json')

    assert response.status_code == 200
    sent_attributes = mock_create.call_args.kwargs['packet_attributes']
    assert sent_attributes['addressId'] == '106'
    assert sent_attributes['street'] == 'Horní'
    assert sent_attributes['houseNumber'] == '12'
    assert sent_attributes['city'] == 'Vrchlabí'


def test_create_shipment_home_delivery_without_config_fails(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        delivery_type=DeliveryType.HOME_DELIVERY, pickup_point_id='', pickup_point_name='',
    )

    response = admin_client.post(f'/api/v1/admin/orders/{order.id}/shipment', {'weight': '1.0'}, format='json')

    assert response.status_code == 422
    order.refresh_from_db()
    assert order.carrier_shipment_id == ''


def test_create_shipment_carrier_api_error_returns_502(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    with patch('shipping.packeta_client.create_packet', side_effect=PacketaApiError('Neplatné apiPassword.')):
        response = admin_client.post(f'/api/v1/admin/orders/{order.id}/shipment', {'weight': '0.5'}, format='json')

    assert response.status_code == 502
    assert response.data['error']['code'] == 'CARRIER_API_ERROR'
    order.refresh_from_db()
    assert order.carrier_shipment_id == ''


def test_create_shipment_twice_fails(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        carrier_shipment_id='111', tracking_number='Z 111',
    )

    response = admin_client.post(f'/api/v1/admin/orders/{order.id}/shipment', {'weight': '0.5'}, format='json')

    assert response.status_code == 409
    assert response.data['error']['code'] == 'SHIPMENT_ALREADY_CREATED'


def test_shipment_label_without_shipment_fails(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.get(f'/api/v1/admin/orders/{order.id}/shipment/label')

    assert response.status_code == 422
    assert response.data['error']['code'] == 'SHIPMENT_NOT_CREATED'


def test_shipment_label_success_bumps_shipment_status(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        carrier_shipment_id='111', tracking_number='Z 111',
    )
    assert order.shipment_status == ShipmentStatus.CREATED

    with patch('shipping.packeta_client.get_label_pdf', return_value=b'%PDF-1.4 fake') as mock_label:
        response = admin_client.get(f'/api/v1/admin/orders/{order.id}/shipment/label', HTTP_ACCEPT='*/*')

    assert response.status_code == 200
    assert response['Content-Type'] == 'application/pdf'
    assert response.content == b'%PDF-1.4 fake'
    assert mock_label.call_args.kwargs['packet_id'] == '111'

    order.refresh_from_db()
    assert order.shipment_status == ShipmentStatus.LABEL_PRINTED


def test_shipment_label_rejects_non_pdf_response(admin_client, motif, product_type, cut, color, packeta_carrier):
    """Packeta can return a "successful" base64 blob that isn't a PDF - e.g.
    the packet was cancelled after creation (invalid pickup point). That must
    surface as a clear error, not get forwarded to the frontend as
    application/pdf, and must not advance shipment_status either.
    """
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        carrier_shipment_id='111', tracking_number='Z 111',
    )

    with patch('shipping.packeta_client.get_label_pdf', return_value=b'\x89not a pdf'), \
         patch('shipping.packeta_client.get_packet_status') as mock_status:
        mock_status.return_value.status_text = 'Zásilka byla stornována.'
        response = admin_client.get(f'/api/v1/admin/orders/{order.id}/shipment/label')

    assert response.status_code == 502
    assert response.data['error']['code'] == 'CARRIER_API_ERROR'
    assert 'stornov' in response.data['error']['message']

    order.refresh_from_db()
    assert order.shipment_status == ShipmentStatus.CREATED


def test_shipment_tracking_without_shipment_fails(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.get(f'/api/v1/admin/orders/{order.id}/shipment/status')

    assert response.status_code == 422
    assert response.data['error']['code'] == 'SHIPMENT_NOT_CREATED'


def test_shipment_tracking_advances_shipment_status(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        carrier_shipment_id='111', tracking_number='Z 111', shipment_status=ShipmentStatus.LABEL_PRINTED,
    )
    packeta_status = PacketStatus(status_code=4, code_text='departed', status_text='Packet is on the way.')

    with patch('shipping.packeta_client.get_packet_status', return_value=packeta_status) as mock_status:
        response = admin_client.get(f'/api/v1/admin/orders/{order.id}/shipment/status')

    assert response.status_code == 200
    assert response.data['shipment_status'] == ShipmentStatus.IN_TRANSIT
    assert mock_status.call_args.kwargs['packet_id'] == '111'
    order.refresh_from_db()
    assert order.shipment_status == ShipmentStatus.IN_TRANSIT


def test_shipment_tracking_never_regresses_shipment_status(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        carrier_shipment_id='111', tracking_number='Z 111', shipment_status=ShipmentStatus.DELIVERED,
    )
    # Packeta reporting an earlier state (e.g. a stale/out-of-order poll)
    # must never move shipment_status backwards.
    packeta_status = PacketStatus(status_code=2, code_text='arrived', status_text='Arrived at branch.')

    with patch('shipping.packeta_client.get_packet_status', return_value=packeta_status):
        response = admin_client.get(f'/api/v1/admin/orders/{order.id}/shipment/status')

    assert response.status_code == 200
    assert response.data['shipment_status'] == ShipmentStatus.DELIVERED
    order.refresh_from_db()
    assert order.shipment_status == ShipmentStatus.DELIVERED


def test_reset_shipping_cost_endpoint_reverts_to_automatic(admin_client, motif, product_type, cut, color, packeta_carrier):
    ShippingPrice.objects.create(carrier=packeta_carrier, delivery_type=DeliveryType.PICKUP_POINT, price=4200)
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        shipping_cost=999, shipping_cost_manual=True,
    )

    response = admin_client.delete(f'/api/v1/admin/orders/{order.id}/shipping-cost')

    assert response.status_code == 200
    assert response.data['shipping_cost'] == 4200
    assert response.data['shipping_cost_manual'] is False
    order.refresh_from_db()
    assert order.shipping_cost == 4200
    assert order.shipping_cost_manual is False


def test_set_shipping_cost_endpoint_marks_manual(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.put(f'/api/v1/admin/orders/{order.id}/shipping-cost', {'shippingCost': 777}, format='json')

    assert response.status_code == 200
    assert response.data['shipping_cost'] == 777
    assert response.data['shipping_cost_manual'] is True


def test_payment_status_endpoint_admin_can_mark_paid(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.patch(f'/api/v1/admin/orders/{order.id}/payment-status', {'paymentStatus': 'PAID'}, format='json')

    assert response.status_code == 200
    assert response.data['payment_status'] == PaymentStatus.PAID


def test_payment_status_endpoint_rejects_invalid_transition(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.patch(f'/api/v1/admin/orders/{order.id}/payment-status', {'paymentStatus': 'REFUNDED'}, format='json')

    assert response.status_code == 409


def test_shipment_status_endpoint_rejects_change_before_production(admin_client, motif, product_type, cut, color, packeta_carrier):
    # Default _order() status is NEW - production hasn't started, so there's
    # nothing to ship yet.
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/shipment-status', {'shipmentStatus': 'DELIVERED'}, format='json',
    )

    assert response.status_code == 409
    assert response.data['error']['code'] == 'INVALID_STATUS_TRANSITION'
    order.refresh_from_db()
    assert order.shipment_status == ShipmentStatus.CREATED


def test_shipment_status_endpoint_allows_forward_move_in_production(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        status=OrderStatus.PROCESSING, shipment_status=ShipmentStatus.LABEL_PRINTED,
    )

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/shipment-status', {'shipmentStatus': 'HANDED_OVER'}, format='json',
    )

    assert response.status_code == 200
    assert response.data['shipment_status'] == ShipmentStatus.HANDED_OVER
    order.refresh_from_db()
    assert order.shipment_status == ShipmentStatus.HANDED_OVER


def test_shipment_status_endpoint_rejects_backward_move(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        status=OrderStatus.SHIPPED, shipment_status=ShipmentStatus.IN_TRANSIT,
    )

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/shipment-status', {'shipmentStatus': 'LABEL_PRINTED'}, format='json',
    )

    assert response.status_code == 409
    order.refresh_from_db()
    assert order.shipment_status == ShipmentStatus.IN_TRANSIT


def test_shipment_status_endpoint_rejects_returned_before_handover(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        status=OrderStatus.PROCESSING, shipment_status=ShipmentStatus.LABEL_PRINTED,
    )

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/shipment-status', {'shipmentStatus': 'RETURNED'}, format='json',
    )

    assert response.status_code == 409


def test_shipment_status_endpoint_allows_returned_after_handover(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        status=OrderStatus.SHIPPED, shipment_status=ShipmentStatus.IN_TRANSIT,
    )

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/shipment-status', {'shipmentStatus': 'RETURNED'}, format='json',
    )

    assert response.status_code == 200
    order.refresh_from_db()
    assert order.shipment_status == ShipmentStatus.RETURNED


def test_shipment_status_endpoint_can_correct_tracking_number_before_production(admin_client, motif, product_type, cut, color, packeta_carrier):
    # trackingNumber may be fixed any time, independent of the shipment
    # status gate above (e.g. a typo noticed before the order even ships).
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/shipment-status',
        {'shipmentStatus': 'CREATED', 'trackingNumber': 'Z 999'},
        format='json',
    )

    assert response.status_code == 409  # CREATED -> CREATED is not "forward"
    order.refresh_from_db()
    assert order.tracking_number == 'Z 999'  # but the correction still landed


def test_confirm_sends_confirmation_email_to_customer(
    admin_client, motif, product_type, cut, color, packeta_carrier, django_capture_on_commit_callbacks,
):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    with django_capture_on_commit_callbacks(execute=True):
        response = admin_client.post(f'/api/v1/admin/orders/{order.id}/confirm', {}, format='json')

    assert response.status_code == 200
    order.refresh_from_db()
    assert order.confirmed_at is not None
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [order.customer.email]
    assert order.order_number in mail.outbox[0].subject


def test_confirm_twice_resends_the_email(
    admin_client, motif, product_type, cut, color, packeta_carrier, django_capture_on_commit_callbacks,
):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    with django_capture_on_commit_callbacks(execute=True):
        admin_client.post(f'/api/v1/admin/orders/{order.id}/confirm', {}, format='json')
    with django_capture_on_commit_callbacks(execute=True):
        second_response = admin_client.post(f'/api/v1/admin/orders/{order.id}/confirm', {}, format='json')

    assert second_response.status_code == 200
    assert len(mail.outbox) == 2


def test_confirm_without_total_returns_422(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier, total=None)

    response = admin_client.post(f'/api/v1/admin/orders/{order.id}/confirm', {}, format='json')

    assert response.status_code == 422
    assert response.data['error']['code'] == 'ORDER_NOT_PRICED'


def test_list_query_count_does_not_grow_with_order_count(admin_client, motif, product_type, cut, color, packeta_carrier, django_assert_max_num_queries):
    for i in range(10):
        _order(
            motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
            email=f'customer{i}@example.cz', order_number=f'TRK-2026-{i:04d}',
        )

    with django_assert_max_num_queries(5):
        response = admin_client.get('/api/v1/admin/orders')

    assert response.status_code == 200
    assert len(response.data['results']) == 10


# ---------------------------------------------------------------------------
# List filters
# ---------------------------------------------------------------------------

def test_list_filters_by_status(admin_client, motif, product_type, cut, color, packeta_carrier):
    new_order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                        email='new@example.cz', order_number='TRK-2026-0101', status=OrderStatus.NEW)
    _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
           email='cancelled@example.cz', order_number='TRK-2026-0102', status=OrderStatus.CANCELLED)

    response = admin_client.get('/api/v1/admin/orders', {'status': 'NEW,PAID'})

    ids = [row['id'] for row in response.data['results']]
    assert ids == [str(new_order.id)]


def test_list_filters_by_payment_status_shipment_status_payment_method(admin_client, motif, product_type, cut, color, packeta_carrier):
    match = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        email='match@example.cz', order_number='TRK-2026-0201',
        payment_status=PaymentStatus.PAID, shipment_status=ShipmentStatus.HANDED_OVER, payment_method=PaymentMethod.INVOICE,
    )
    _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        email='other@example.cz', order_number='TRK-2026-0202',
    )

    response = admin_client.get('/api/v1/admin/orders', {
        'paymentStatus': 'PAID', 'shipmentStatus': 'HANDED_OVER', 'paymentMethod': 'INVOICE',
    })

    assert [row['id'] for row in response.data['results']] == [str(match.id)]


def test_list_filters_by_carrier_and_customer(admin_client, motif, product_type, cut, color, packeta_carrier):
    other_carrier = Carrier.objects.create(code='OTHER', name='Jiný dopravce')
    match = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                    email='match@example.cz', order_number='TRK-2026-0301')
    _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=other_carrier,
           email='other@example.cz', order_number='TRK-2026-0302')

    by_carrier = admin_client.get('/api/v1/admin/orders', {'carrier': str(packeta_carrier.id)})
    assert [row['id'] for row in by_carrier.data['results']] == [str(match.id)]

    by_customer = admin_client.get('/api/v1/admin/orders', {'customer': str(match.customer_id)})
    assert [row['id'] for row in by_customer.data['results']] == [str(match.id)]


def test_list_filters_by_has_custom(admin_client, motif, product_type, cut, color, packeta_carrier, print_area):
    catalog_order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                            email='catalog@example.cz', order_number='TRK-2026-0401')
    custom_order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                           email='custom@example.cz', order_number='TRK-2026-0402')
    build_order_item(custom_order, {
        'is_custom': True, 'motif': None, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1,
        'placements': [{'print_area': print_area, 'url': 'x', 'x': 0, 'y': 0, 'width': 10, 'height': 10, 'rotation_deg': 0}],
    })

    only_custom = admin_client.get('/api/v1/admin/orders', {'hasCustom': 'true'})
    assert [row['id'] for row in only_custom.data['results']] == [str(custom_order.id)]

    only_catalog = admin_client.get('/api/v1/admin/orders', {'hasCustom': 'false'})
    assert [row['id'] for row in only_catalog.data['results']] == [str(catalog_order.id)]

    # Regression guard: an order with BOTH a catalog and a custom item must
    # appear exactly once in the unfiltered list with hasCustom=true - not
    # twice (one row per distinct has_custom value), which is what happened
    # when has_custom was computed via Case/When on the same annotate() as
    # the Count aggregate (see get_queryset's comment).
    unfiltered = admin_client.get('/api/v1/admin/orders')
    assert len(unfiltered.data['results']) == 2
    custom_row = next(row for row in unfiltered.data['results'] if row['id'] == str(custom_order.id))
    assert custom_row['has_custom'] is True


def test_list_filters_by_created_date_range_and_search(admin_client, motif, product_type, cut, color, packeta_carrier):
    from datetime import timedelta
    from django.utils import timezone

    old_order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                        email='old@example.cz', order_number='TRK-2026-0501')
    Order.objects.filter(pk=old_order.pk).update(created_at=timezone.now() - timedelta(days=10))
    recent_order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                           email='recent@example.cz', order_number='TRK-2026-0502')

    today = timezone.now().date()
    response = admin_client.get('/api/v1/admin/orders', {'createdFrom': str(today), 'createdTo': str(today)})
    assert [row['id'] for row in response.data['results']] == [str(recent_order.id)]

    by_search = admin_client.get('/api/v1/admin/orders', {'q': 'recent@example.cz'})
    assert [row['id'] for row in by_search.data['results']] == [str(recent_order.id)]


# ---------------------------------------------------------------------------
# PATCH /admin/orders/{id} - partial_update
# ---------------------------------------------------------------------------

def test_partial_update_editable_order_changes_address_and_carrier(admin_client, motif, product_type, cut, color, packeta_carrier):
    other_carrier = Carrier.objects.create(code='OTHER', name='Jiný dopravce')
    ShippingPrice.objects.create(carrier=other_carrier, delivery_type=DeliveryType.PICKUP_POINT, price=6900)
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                    status=OrderStatus.NEW)

    response = admin_client.patch(f'/api/v1/admin/orders/{order.id}', {
        'billing': {'fullName': 'Nové Jméno', 'street': 'Nová 1', 'city': 'Praha', 'zip': '11000'},
        'shipping': {'fullName': 'Jiný Příjemce', 'street': 'Doručovací 2', 'city': 'Brno', 'zip': '60200'},
        'carrierId': str(other_carrier.id),
        'deliveryType': 'PICKUP_POINT',
        'pickupPointId': '999',
        'pickupPointName': 'Z-BOX Brno',
        'paymentMethod': 'INVOICE',
        'note': 'Aktualizovaná poznámka',
    }, format='json')

    assert response.status_code == 200
    order.refresh_from_db()
    assert order.billing_full_name == 'Nové Jméno'
    assert order.shipping_full_name == 'Jiný Příjemce'
    assert order.shipping_city == 'Brno'
    assert order.carrier_id == other_carrier.id
    assert order.delivery_type == 'PICKUP_POINT'
    assert order.pickup_point_id == '999'
    assert order.pickup_point_name == 'Z-BOX Brno'
    assert order.payment_method == 'INVOICE'
    assert order.note == 'Aktualizovaná poznámka'


def test_retrieve_order_detail(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.get(f'/api/v1/admin/orders/{order.id}')

    assert response.status_code == 200
    assert response.data['order_number'] == order.order_number


def test_partial_update_locked_fields_on_locked_order_return_409(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                    status=OrderStatus.PROCESSING)

    response = admin_client.patch(f'/api/v1/admin/orders/{order.id}', {'note': 'nope'}, format='json')

    assert response.status_code == 409
    assert response.data['error']['code'] == 'ORDER_LOCKED'


def test_partial_update_tracking_number_editable_even_when_locked(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                    status=OrderStatus.PROCESSING)

    response = admin_client.patch(f'/api/v1/admin/orders/{order.id}', {'trackingNumber': 'Z 123'}, format='json')

    assert response.status_code == 200
    order.refresh_from_db()
    assert order.tracking_number == 'Z 123'


def test_partial_update_personal_pickup_with_carrier_returns_400(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                    status=OrderStatus.NEW)

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}', {'deliveryType': 'PERSONAL_PICKUP', 'carrierId': str(packeta_carrier.id)},
        format='json',
    )

    assert response.status_code == 400


def test_partial_update_delivery_type_without_carrier_returns_400(admin_client, motif, product_type, cut, color):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=None,
        delivery_type=None, status=OrderStatus.NEW,
    )

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}', {'deliveryType': 'PICKUP_POINT'}, format='json',
    )

    assert response.status_code == 400


def test_partial_update_pickup_point_without_id_or_name_returns_400(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        status=OrderStatus.NEW, pickup_point_id='', pickup_point_name='',
    )

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}', {'deliveryType': 'PICKUP_POINT', 'carrierId': str(packeta_carrier.id)},
        format='json',
    )

    assert response.status_code == 400


def test_put_on_order_detail_is_not_allowed(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.put(f'/api/v1/admin/orders/{order.id}', {}, format='json')

    assert response.status_code == 405


def test_delete_on_order_detail_is_not_allowed(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.delete(f'/api/v1/admin/orders/{order.id}')

    assert response.status_code == 405


# ---------------------------------------------------------------------------
# PATCH /admin/orders/{id}/items/{itemId}
# ---------------------------------------------------------------------------

def test_update_item_price_via_http_recalculates_total(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                    status=OrderStatus.QUOTE_REQUESTED, subtotal=None, total=None)
    item = order.items.get()

    response = admin_client.patch(f'/api/v1/admin/orders/{order.id}/items/{item.id}', {'unitPrice': 12345}, format='json')

    assert response.status_code == 200
    item.refresh_from_db()
    assert item.unit_price == 12345


def test_update_item_unknown_item_id_returns_404(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/items/00000000-0000-0000-0000-000000000000', {'unitPrice': 1}, format='json',
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /admin/orders/{id}/items/{itemId}/placements/{placementId}
# ---------------------------------------------------------------------------

def _custom_order_with_placement(motif, product_type, cut, color, packeta_carrier, print_area):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                    status=OrderStatus.QUOTE_REQUESTED, subtotal=None, total=None, order_number='TRK-2026-CUSTOM')
    order.items.all().delete()  # drop the default catalog item from the _order helper
    build_order_item(order, {
        'is_custom': True, 'motif': None, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1,
        'placements': [{'print_area': print_area, 'url': 'x', 'x': 0, 'y': 0, 'width': 10, 'height': 10, 'rotation_deg': 0}],
    })
    return order


def test_update_placement_success(admin_client, motif, product_type, cut, color, packeta_carrier, print_area):
    order = _custom_order_with_placement(motif, product_type, cut, color, packeta_carrier, print_area)
    item = order.items.get()
    placement = item.design_placements.get()

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/items/{item.id}/placements/{placement.id}',
        {'x': 5, 'y': 5, 'width': 20, 'height': 20}, format='json',
    )

    assert response.status_code == 200
    placement.refresh_from_db()
    assert placement.width == 20


def test_update_placement_item_not_found_returns_404(admin_client, motif, product_type, cut, color, packeta_carrier, print_area):
    order = _custom_order_with_placement(motif, product_type, cut, color, packeta_carrier, print_area)

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/items/00000000-0000-0000-0000-000000000000/placements/00000000-0000-0000-0000-000000000000',
        {'width': 20}, format='json',
    )

    assert response.status_code == 404


def test_update_placement_placement_not_found_returns_404(admin_client, motif, product_type, cut, color, packeta_carrier, print_area):
    order = _custom_order_with_placement(motif, product_type, cut, color, packeta_carrier, print_area)
    item = order.items.get()

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/items/{item.id}/placements/00000000-0000-0000-0000-000000000000',
        {'width': 20}, format='json',
    )

    assert response.status_code == 404


def test_update_placement_mismatched_product_type_returns_422(admin_client, motif, product_type, cut, color, packeta_carrier, print_area):
    from catalog.models import ProductType, PrintArea

    order = _custom_order_with_placement(motif, product_type, cut, color, packeta_carrier, print_area)
    item = order.items.get()
    placement = item.design_placements.get()
    other_type = ProductType.objects.create(name='Mikina')
    other_area = PrintArea.objects.create(product_type=other_type, name='Kapuce', width_mm=50, height_mm=50)

    response = admin_client.patch(
        f'/api/v1/admin/orders/{order.id}/items/{item.id}/placements/{placement.id}',
        {'printAreaId': str(other_area.id)}, format='json',
    )

    assert response.status_code == 422
    assert response.data['error']['code'] == 'PRINT_AREA_PRODUCT_TYPE_MISMATCH'


# ---------------------------------------------------------------------------
# GET /admin/orders/{id}/items/{itemId}/placements/{placementId}/file
# ---------------------------------------------------------------------------

def test_placement_file_redirects_to_stored_url(admin_client, motif, product_type, cut, color, packeta_carrier, print_area):
    order = _custom_order_with_placement(motif, product_type, cut, color, packeta_carrier, print_area)
    item = order.items.get()
    placement = item.design_placements.get()

    response = admin_client.get(f'/api/v1/admin/orders/{order.id}/items/{item.id}/placements/{placement.id}/file')

    assert response.status_code == 302
    assert response['Location'] == placement.url


def test_placement_file_item_not_found_returns_404(admin_client, motif, product_type, cut, color, packeta_carrier, print_area):
    order = _custom_order_with_placement(motif, product_type, cut, color, packeta_carrier, print_area)

    response = admin_client.get(
        f'/api/v1/admin/orders/{order.id}/items/00000000-0000-0000-0000-000000000000/placements/00000000-0000-0000-0000-000000000000/file',
    )

    assert response.status_code == 404


def test_placement_file_placement_not_found_returns_404(admin_client, motif, product_type, cut, color, packeta_carrier, print_area):
    order = _custom_order_with_placement(motif, product_type, cut, color, packeta_carrier, print_area)
    item = order.items.get()

    response = admin_client.get(
        f'/api/v1/admin/orders/{order.id}/items/{item.id}/placements/00000000-0000-0000-0000-000000000000/file',
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /admin/orders/{id}/status
# ---------------------------------------------------------------------------

def test_status_action_to_shipped_sends_email(
    admin_client, motif, product_type, cut, color, packeta_carrier, django_capture_on_commit_callbacks,
):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                    status=OrderStatus.PROCESSING)

    with django_capture_on_commit_callbacks(execute=True):
        response = admin_client.post(f'/api/v1/admin/orders/{order.id}/status', {'status': 'SHIPPED'}, format='json')

    assert response.status_code == 200
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [order.customer.email]


def test_status_action_to_cancelled_sends_email(
    admin_client, motif, product_type, cut, color, packeta_carrier, django_capture_on_commit_callbacks,
):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
                    status=OrderStatus.NEW)

    with django_capture_on_commit_callbacks(execute=True):
        response = admin_client.post(f'/api/v1/admin/orders/{order.id}/status', {'status': 'CANCELLED'}, format='json')

    assert response.status_code == 200
    assert len(mail.outbox) == 1


def test_status_action_unknown_status_value_returns_400(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.post(f'/api/v1/admin/orders/{order.id}/status', {'status': 'NOT_A_STATUS'}, format='json')

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# PATCH /admin/orders/{id}/payment-status, /shipment-status
# ---------------------------------------------------------------------------

def test_payment_status_unknown_value_returns_400(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.patch(f'/api/v1/admin/orders/{order.id}/payment-status', {'paymentStatus': 'NOT_A_STATUS'}, format='json')

    assert response.status_code == 400


def test_shipment_status_unknown_value_returns_400(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.patch(f'/api/v1/admin/orders/{order.id}/shipment-status', {'shipmentStatus': 'NOT_A_STATUS'}, format='json')

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# POST /admin/orders/{id}/resend-email, GET /admin/orders/{id}/print-sheet
# ---------------------------------------------------------------------------

def test_resend_email_sends_requested_type(
    admin_client, motif, product_type, cut, color, packeta_carrier,
):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.post(f'/api/v1/admin/orders/{order.id}/resend-email', {'type': 'ORDER_RECEIVED'}, format='json')

    assert response.status_code == 204
    assert len(mail.outbox) == 1


def test_resend_email_unknown_type_returns_400(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.post(f'/api/v1/admin/orders/{order.id}/resend-email', {'type': 'NOT_A_TYPE'}, format='json')

    assert response.status_code == 400


def test_print_sheet_returns_order_detail(admin_client, motif, product_type, cut, color, packeta_carrier):
    order = _order(motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier)

    response = admin_client.get(f'/api/v1/admin/orders/{order.id}/print-sheet')

    assert response.status_code == 200
    assert response.data['order_number'] == order.order_number


# ---------------------------------------------------------------------------
# Order export (Excel) - GET /admin/orders/export
# ---------------------------------------------------------------------------

def test_export_returns_xlsx_with_matching_order_row(admin_client, motif, product_type, cut, color, packeta_carrier):
    import openpyxl

    order = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        note='=1+1',
    )

    response = admin_client.get('/api/v1/admin/orders/export')

    assert response.status_code == 200
    assert response['Content-Type'] == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    assert response['Content-Disposition'] == 'attachment; filename="objednavky.xlsx"'

    workbook = openpyxl.load_workbook(BytesIO(response.content))
    sheet = workbook.active
    header = [cell.value for cell in sheet[1]]
    assert header[0] == 'Číslo objednávky'
    row = [cell.value for cell in sheet[2]]
    assert row[0] == order.order_number
    assert row[sheet.max_column - 1] == order.note  # poslední sloupec = poznámka
    assert sheet[2][-1].data_type == 's'
    # Mezisoučet/doprava/celkem jsou v Kč, ne v haléřích jako jinde v API.
    money_columns = {header.index('Mezisoučet (Kč)'): 599.0, header.index('Celkem (Kč)'): 649.0}
    for index, expected in money_columns.items():
        assert row[index] == expected


def test_export_respects_list_filters(admin_client, motif, product_type, cut, color, packeta_carrier):
    import openpyxl

    matching = _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        order_number='TRK-2026-0001', email='a@example.cz', status=OrderStatus.NEW,
    )
    _order(
        motif=motif, product_type=product_type, cut=cut, color=color, packeta_carrier=packeta_carrier,
        order_number='TRK-2026-0002', email='b@example.cz', status=OrderStatus.CANCELLED,
    )

    response = admin_client.get('/api/v1/admin/orders/export', {'status': 'NEW'})

    workbook = openpyxl.load_workbook(BytesIO(response.content))
    sheet = workbook.active
    order_numbers = [row[0].value for row in sheet.iter_rows(min_row=2)]
    assert order_numbers == [matching.order_number]


def test_export_requires_admin_login():
    response = APIClient().get('/api/v1/admin/orders/export')
    assert response.status_code in (401, 403)
