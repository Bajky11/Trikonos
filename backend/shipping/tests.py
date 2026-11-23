from unittest.mock import Mock, patch

import pytest
import zeep.exceptions
from rest_framework.test import APIClient

from accounts.models import User
from core.exceptions import BusinessError, PacketaApiError
from customers.models import Customer
from orders.models import DeliveryType, Order, PaymentMethod

from . import packeta_client
from .models import Carrier, CodSurcharge, PacketaConfig, ShippingPrice, ShippingQuantityDiscount
from .services import _split_street, build_packet_attributes, order_courier_pickup

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(email='admin@trikonos.cz', password='x', name='Admin')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def shipping_price(carrier):
    return ShippingPrice.objects.create(carrier=carrier, delivery_type=DeliveryType.HOME_DELIVERY, price=5000)


# ---------------------------------------------------------------------------
# Carriers
# ---------------------------------------------------------------------------

def test_can_list_carriers(admin_client, carrier):
    response = admin_client.get('/api/v1/admin/carriers')
    assert response.status_code == 200
    assert len(response.data['results']) == 1


def test_unauthenticated_cannot_list_carriers():
    response = APIClient().get('/api/v1/admin/carriers')
    assert response.status_code in (401, 403)


def test_admin_create_carrier_uppercases_code(admin_client):
    response = admin_client.post('/api/v1/admin/carriers', {'name': 'DPD', 'code': 'dpd'}, format='json')

    assert response.status_code == 201
    assert response.data['code'] == 'DPD'


def test_admin_can_reorder_carriers(admin_client, carrier):
    second = Carrier.objects.create(code='DPD', name='DPD')

    response = admin_client.post(
        '/api/v1/admin/carriers/reorder', {'ids': [str(second.id), str(carrier.id)]}, format='json',
    )

    assert response.status_code == 204
    second.refresh_from_db()
    carrier.refresh_from_db()
    assert second.position < carrier.position


def test_admin_can_deactivate_carrier_instead_of_deleting(admin_client, carrier):
    response = admin_client.patch(f'/api/v1/admin/carriers/{carrier.id}', {'isActive': False}, format='json')

    assert response.status_code == 200
    carrier.refresh_from_db()
    assert carrier.is_active is False


# ---------------------------------------------------------------------------
# Shipping prices
# ---------------------------------------------------------------------------

def test_create_shipping_price(admin_client, carrier):
    response = admin_client.post(
        '/api/v1/admin/shipping-prices',
        {'carrierId': str(carrier.id), 'deliveryType': DeliveryType.PICKUP_POINT, 'price': 7900},
        format='json',
    )

    assert response.status_code == 201
    assert ShippingPrice.objects.filter(carrier=carrier, delivery_type=DeliveryType.PICKUP_POINT, price=7900).exists()


def test_duplicate_shipping_price_for_same_pair_returns_400(admin_client, shipping_price, carrier):
    response = admin_client.post(
        '/api/v1/admin/shipping-prices',
        {'carrierId': str(carrier.id), 'deliveryType': DeliveryType.HOME_DELIVERY, 'price': 1000},
        format='json',
    )

    # Documented as 400 (not 409) for this one - see AdminShippingPriceViewSet's
    # extra_note; unlike the quantity-discount tiers, this is deliberate.
    assert response.status_code == 400


def test_can_read_and_write_shipping_prices(admin_client, shipping_price):
    read = admin_client.get('/api/v1/admin/shipping-prices')
    assert read.status_code == 200

    write = admin_client.patch(f'/api/v1/admin/shipping-prices/{shipping_price.id}', {'price': 1000}, format='json')
    assert write.status_code == 200


# ---------------------------------------------------------------------------
# COD surcharge (singleton)
# ---------------------------------------------------------------------------

def test_can_view_cod_surcharge(admin_client):
    response = admin_client.get('/api/v1/admin/cod-surcharge')
    assert response.status_code == 200
    assert response.data['amount'] == 0


def test_admin_can_update_cod_surcharge(admin_client):
    response = admin_client.put('/api/v1/admin/cod-surcharge', {'amount': 2900}, format='json')

    assert response.status_code == 200
    assert CodSurcharge.get_solo().amount == 2900


# ---------------------------------------------------------------------------
# Packeta config (singleton, requires authentication for both read and write)
# ---------------------------------------------------------------------------

def test_unauthenticated_cannot_view_packeta_config():
    response = APIClient().get('/api/v1/admin/packeta-config')
    assert response.status_code in (401, 403)


def test_admin_can_set_packeta_config(admin_client):
    response = admin_client.put(
        '/api/v1/admin/packeta-config', {'apiPassword': 'secret', 'eshop': 'trikonos'}, format='json',
    )

    assert response.status_code == 200
    assert 'api_password' not in response.data
    assert response.data['api_password_set'] is True
    config = PacketaConfig.get_solo()
    assert config.api_password == 'secret'
    assert config.eshop == 'trikonos'


def test_admin_can_view_packeta_config_without_leaking_password(admin_client):
    not_configured = admin_client.get('/api/v1/admin/packeta-config')
    assert not_configured.status_code == 200
    assert 'api_password' not in not_configured.data
    assert not_configured.data['api_password_set'] is False

    PacketaConfig.objects.update_or_create(pk=1, defaults={'api_password': 'topsecret'})

    configured = admin_client.get('/api/v1/admin/packeta-config')
    assert 'api_password' not in configured.data
    assert configured.data['api_password_set'] is True


def test_duplicate_min_quantity_on_create_returns_409(admin_client, shipping_price):
    ShippingQuantityDiscount.objects.create(shipping_price=shipping_price, min_quantity=30, discount_percent=30)

    response = admin_client.post(
        '/api/v1/admin/shipping-quantity-discounts',
        {'shippingPriceId': str(shipping_price.id), 'minQuantity': 30, 'discountPercent': 50},
        format='json',
    )

    assert response.status_code == 409
    assert response.data['error']['code'] == 'DUPLICATE_QUANTITY_DISCOUNT'
    assert ShippingQuantityDiscount.objects.filter(shipping_price=shipping_price).count() == 1


def test_duplicate_min_quantity_on_update_returns_409(admin_client, shipping_price):
    ShippingQuantityDiscount.objects.create(shipping_price=shipping_price, min_quantity=30, discount_percent=30)
    other = ShippingQuantityDiscount.objects.create(shipping_price=shipping_price, min_quantity=50, discount_percent=100)

    response = admin_client.patch(
        f'/api/v1/admin/shipping-quantity-discounts/{other.id}', {'minQuantity': 30}, format='json',
    )

    assert response.status_code == 409
    assert response.data['error']['code'] == 'DUPLICATE_QUANTITY_DISCOUNT'
    other.refresh_from_db()
    assert other.min_quantity == 50


def test_updating_a_tier_to_its_own_min_quantity_is_not_a_false_conflict(admin_client, shipping_price):
    tier = ShippingQuantityDiscount.objects.create(shipping_price=shipping_price, min_quantity=30, discount_percent=30)

    response = admin_client.patch(
        f'/api/v1/admin/shipping-quantity-discounts/{tier.id}', {'minQuantity': 30, 'discountPercent': 40}, format='json',
    )

    assert response.status_code == 200
    tier.refresh_from_db()
    assert tier.discount_percent == 40


def test_discount_percent_out_of_range_returns_400(admin_client, shipping_price):
    response = admin_client.post(
        '/api/v1/admin/shipping-quantity-discounts',
        {'shippingPriceId': str(shipping_price.id), 'minQuantity': 10, 'discountPercent': 150},
        format='json',
    )

    assert response.status_code == 400


def test_quantity_discounts_filtered_by_isactive_and_shipping_price(admin_client, shipping_price, carrier):
    other_price = ShippingPrice.objects.create(carrier=carrier, delivery_type=DeliveryType.PICKUP_POINT, price=3000)
    matching = ShippingQuantityDiscount.objects.create(shipping_price=shipping_price, min_quantity=10, discount_percent=10)
    ShippingQuantityDiscount.objects.create(shipping_price=shipping_price, min_quantity=20, discount_percent=20, is_active=False)
    ShippingQuantityDiscount.objects.create(shipping_price=other_price, min_quantity=10, discount_percent=10)

    by_price = admin_client.get('/api/v1/admin/shipping-quantity-discounts', {'shippingPriceId': str(shipping_price.id)})
    assert len(by_price.data['results']) == 2

    by_active = admin_client.get('/api/v1/admin/shipping-quantity-discounts', {'isActive': 'true'})
    assert str(matching.id) in [row['id'] for row in by_active.data['results']]
    assert len(by_active.data['results']) == 2  # matching + the other_price one, both active


def test_shipping_prices_filtered_by_carrier(admin_client, shipping_price, carrier):
    other_carrier = Carrier.objects.create(code='OTHER', name='Jiný dopravce')
    ShippingPrice.objects.create(carrier=other_carrier, delivery_type=DeliveryType.HOME_DELIVERY, price=1000)

    response = admin_client.get('/api/v1/admin/shipping-prices', {'carrier': str(carrier.id)})

    assert [row['id'] for row in response.data['results']] == [str(shipping_price.id)]


# ---------------------------------------------------------------------------
# __str__ methods
# ---------------------------------------------------------------------------

def test_shipping_price_str(shipping_price):
    assert str(shipping_price) == f'{shipping_price.carrier.name} / Home delivery'


def test_packeta_config_str():
    assert str(PacketaConfig()) == 'Packeta'


def test_cod_surcharge_str():
    assert str(CodSurcharge()) == 'Příplatek za dobírku'


def test_shipping_quantity_discount_str(shipping_price):
    tier = ShippingQuantityDiscount.objects.create(shipping_price=shipping_price, min_quantity=30, discount_percent=50)
    assert str(tier) == '30+ ks → -50%'


# ---------------------------------------------------------------------------
# shipping.services - pure functions, called directly (not through the
# /admin/orders/{id}/shipment HTTP endpoint, which already exercises the
# happy path via mocked shipping.packeta_client calls in orders/tests/).
# ---------------------------------------------------------------------------

def test_split_street_without_trailing_house_number_keeps_whole_string():
    assert _split_street('Náměstí Míru') == ('Náměstí Míru', '')


def test_split_street_with_trailing_house_number():
    assert _split_street('Horní 12') == ('Horní', '12')


def _bare_order(
    *, carrier=None, delivery_type=None, total=None, payment_method=PaymentMethod.BANK_TRANSFER, company_name='',
    order_number='TRK-2026-9001', carrier_shipment_id='', email='jana@example.cz',
):
    customer = Customer.objects.create(
        email=email, first_name='Jana', last_name='Nováková', phone='+420777123456',
        company_name=company_name,
    )
    return Order.objects.create(
        order_number=order_number, customer=customer, total=total,
        carrier=carrier, delivery_type=delivery_type, payment_method=payment_method,
        carrier_shipment_id=carrier_shipment_id,
        pickup_point_id='131', pickup_point_name='Vrchlabí',
        billing_full_name='Jana Nováková', billing_street='Horní 12', billing_city='Vrchlabí', billing_zip='54301',
        shipping_full_name='Jana Nováková', shipping_street='Horní 12', shipping_city='Vrchlabí', shipping_zip='54301',
    )


def test_build_packet_attributes_requires_packeta_carrier(carrier):
    other_carrier = Carrier.objects.create(code='DPD', name='DPD')
    order = _bare_order(carrier=other_carrier, delivery_type=DeliveryType.PICKUP_POINT, total=10000)

    with pytest.raises(BusinessError):
        build_packet_attributes(order, weight=1.0)


def test_build_packet_attributes_requires_delivery_type(carrier):
    carrier.code = 'PACKETA'
    carrier.save(update_fields=['code'])
    order = _bare_order(carrier=carrier, delivery_type=None, total=10000)

    with pytest.raises(BusinessError):
        build_packet_attributes(order, weight=1.0)


def test_build_packet_attributes_requires_resolvable_value(carrier):
    carrier.code = 'PACKETA'
    carrier.save(update_fields=['code'])
    order = _bare_order(carrier=carrier, delivery_type=DeliveryType.PICKUP_POINT, total=None)

    with pytest.raises(BusinessError):
        build_packet_attributes(order, weight=1.0)


def test_build_packet_attributes_includes_company_eshop_and_cod(carrier):
    carrier.code = 'PACKETA'
    carrier.save(update_fields=['code'])
    PacketaConfig.objects.update_or_create(pk=1, defaults={'eshop': 'trikonos-eshop'})
    order = _bare_order(
        carrier=carrier, delivery_type=DeliveryType.PICKUP_POINT, total=59900,
        payment_method=PaymentMethod.CASH_ON_DELIVERY, company_name='Firma s.r.o.',
    )

    attributes = build_packet_attributes(order, weight=1.0)

    assert attributes['company'] == 'Firma s.r.o.'
    assert attributes['eshop'] == 'trikonos-eshop'
    assert attributes['cod'] == 599.0


# ---------------------------------------------------------------------------
# shipping.packeta_client - the module's OWN code (SOAP client singleton,
# Fault -> PacketaApiError translation, dataclass construction). Distinct
# from orders/tests/test_admin_views.py, which mocks create_packet/
# get_label_pdf/get_packet_status themselves and never exercises what's
# inside them. _get_client is mocked here instead of zeep.Client, except in
# the one test that specifically proves the singleton construction itself -
# this avoids ever touching the network/WSDL in any test.
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_packeta_client_singleton():
    packeta_client._client = None
    yield
    packeta_client._client = None


def test_get_client_builds_and_caches_a_zeep_client():
    with patch('shipping.packeta_client.zeep.Client') as mock_zeep_client:
        mock_zeep_client.return_value = Mock()
        first = packeta_client._get_client()
        second = packeta_client._get_client()

    mock_zeep_client.assert_called_once_with(wsdl=packeta_client.SOAP_WSDL)
    assert first is second


def test_create_packet_success():
    PacketaConfig.objects.update_or_create(pk=1, defaults={'api_password': 'secret'})
    fake_client = Mock()
    fake_client.service.createPacket.return_value = Mock(id=123, barcode='Z1', barcodeText='Z 1 0000 000')

    with patch('shipping.packeta_client._get_client', return_value=fake_client):
        result = packeta_client.create_packet(packet_attributes={'number': 'TRK-2026-0001'})

    assert result.packet_id == '123'
    assert result.barcode == 'Z1'
    assert result.barcode_text == 'Z 1 0000 000'
    fake_client.service.createPacket.assert_called_once_with('secret', {'number': 'TRK-2026-0001'})


def test_create_packet_fault_raises_packeta_api_error():
    fake_client = Mock()
    fake_client.service.createPacket.side_effect = zeep.exceptions.Fault('Invalid apiPassword.')

    with patch('shipping.packeta_client._get_client', return_value=fake_client):
        with pytest.raises(PacketaApiError):
            packeta_client.create_packet(packet_attributes={})


def test_get_label_pdf_returns_raw_bytes():
    """zeep already decodes the WSDL's base64Binary return type to raw bytes -
    get_label_pdf must return that as-is, not base64-decode it again.
    """
    fake_client = Mock()
    fake_client.service.packetLabelPdf.return_value = b'%PDF-1.4 fake label'

    with patch('shipping.packeta_client._get_client', return_value=fake_client):
        pdf_bytes = packeta_client.get_label_pdf(packet_id='123', label_format='A6 on A4')

    assert pdf_bytes == b'%PDF-1.4 fake label'


def test_get_label_pdf_fault_raises_packeta_api_error():
    fake_client = Mock()
    fake_client.service.packetLabelPdf.side_effect = zeep.exceptions.Fault('Packet not found.')

    with patch('shipping.packeta_client._get_client', return_value=fake_client):
        with pytest.raises(PacketaApiError):
            packeta_client.get_label_pdf(packet_id='123', label_format='A6 on A4')


def test_get_packet_status_success():
    fake_client = Mock()
    fake_client.service.packetStatus.return_value = Mock(statusCode=4, codeText='departed', statusText='Packet is on the way.')

    with patch('shipping.packeta_client._get_client', return_value=fake_client):
        result = packeta_client.get_packet_status(packet_id='123')

    assert result.status_code == 4
    assert result.code_text == 'departed'
    assert result.status_text == 'Packet is on the way.'


def test_get_packet_status_fault_raises_packeta_api_error():
    fake_client = Mock()
    fake_client.service.packetStatus.side_effect = zeep.exceptions.Fault('Packet not found.')

    with patch('shipping.packeta_client._get_client', return_value=fake_client):
        with pytest.raises(PacketaApiError):
            packeta_client.get_packet_status(packet_id='123')


def test_create_courier_pickup_success():
    PacketaConfig.objects.update_or_create(pk=1, defaults={'api_password': 'secret', 'eshop': 'trikonos'})
    fake_client = Mock()
    fake_client.service.createCourierPickup.return_value = Mock(pickupId=555, externalId='EXT-555')

    with patch('shipping.packeta_client._get_client', return_value=fake_client):
        result = packeta_client.create_courier_pickup(
            address_id=42, pickup_address={'street': 'Horní'}, pickup_date={'from': 'x', 'to': 'y'},
            packet_ids=[1, 2], note='Vyzvednout vzadu',
        )

    assert result.pickup_id == '555'
    assert result.external_id == 'EXT-555'
    fake_client.service.createCourierPickup.assert_called_once_with(
        'secret', 'trikonos', 42, {'street': 'Horní'}, {'from': 'x', 'to': 'y'}, {'id': [1, 2]}, 'Vyzvednout vzadu',
    )


def test_create_courier_pickup_fault_raises_packeta_api_error():
    fake_client = Mock()
    fake_client.service.createCourierPickup.side_effect = zeep.exceptions.Fault('Invalid address.')

    with patch('shipping.packeta_client._get_client', return_value=fake_client):
        with pytest.raises(PacketaApiError):
            packeta_client.create_courier_pickup(address_id=1, pickup_address={}, pickup_date={}, packet_ids=[1])


# ---------------------------------------------------------------------------
# Courier pickup (svoz) - shipping.services.order_courier_pickup plus the
# POST /admin/courier-pickups endpoint wrapping it. shipping.packeta_client.
# create_courier_pickup itself is mocked throughout (already covered above).
# ---------------------------------------------------------------------------

@pytest.fixture
def packeta_pickup_config(db):
    PacketaConfig.objects.update_or_create(pk=1, defaults={
        'api_password': 'secret', 'eshop': 'trikonos', 'pickup_address_id': '77',
        'pickup_company_name': 'Trikonoš s.r.o.', 'pickup_contact_name': 'Jana', 'pickup_contact_surname': 'Nováková',
        'pickup_email': 'info@trikonos.cz', 'pickup_phone': '+420777000111',
        'pickup_street': 'Dílenská', 'pickup_house_number': '5', 'pickup_city': 'Vrchlabí', 'pickup_zip': '54301',
    })
    return PacketaConfig.get_solo()


def test_courier_pickup_requires_pickup_address_configured(carrier):
    order = _bare_order(carrier=carrier, carrier_shipment_id='111')

    with pytest.raises(BusinessError):
        order_courier_pickup([order.id], pickup_from='2026-11-20T08:00:00Z', pickup_to='2026-11-20T12:00:00Z')


def test_courier_pickup_missing_order_raises_order_not_found(packeta_pickup_config):
    import uuid

    with pytest.raises(BusinessError) as exc_info:
        order_courier_pickup(
            [uuid.uuid4()], pickup_from='2026-11-20T08:00:00Z', pickup_to='2026-11-20T12:00:00Z',
        )

    assert exc_info.value.code == 'ORDER_NOT_FOUND'


def test_courier_pickup_order_without_shipment_raises(packeta_pickup_config, carrier):
    order = _bare_order(carrier=carrier)

    with pytest.raises(BusinessError) as exc_info:
        order_courier_pickup([order.id], pickup_from='2026-11-20T08:00:00Z', pickup_to='2026-11-20T12:00:00Z')

    assert exc_info.value.code == 'SHIPMENT_NOT_CREATED'


def test_courier_pickup_success_calls_client_with_batched_packet_ids(packeta_pickup_config, carrier):
    order_a = _bare_order(
        carrier=carrier, carrier_shipment_id='111', order_number='TRK-2026-0001', email='a@example.cz',
    )
    order_b = _bare_order(
        carrier=carrier, carrier_shipment_id='222', order_number='TRK-2026-0002', email='b@example.cz',
    )
    created = packeta_client.CreatedCourierPickup(pickup_id='999', external_id='EXT-999')

    with patch('shipping.packeta_client.create_courier_pickup', return_value=created) as mock_create:
        result, orders = order_courier_pickup(
            [order_a.id, order_b.id],
            pickup_from='2026-11-20T08:00:00+00:00', pickup_to='2026-11-20T12:00:00+00:00', note='Zadní vchod',
        )

    assert result.pickup_id == '999'
    assert {order.id for order in orders} == {order_a.id, order_b.id}
    kwargs = mock_create.call_args.kwargs
    assert sorted(kwargs['packet_ids']) == [111, 222]
    assert kwargs['address_id'] == 77
    assert kwargs['pickup_address']['city'] == 'Vrchlabí'
    assert kwargs['note'] == 'Zadní vchod'


def test_admin_courier_pickup_endpoint_success(admin_client, packeta_pickup_config, carrier):
    order = _bare_order(carrier=carrier, carrier_shipment_id='111')
    created = packeta_client.CreatedCourierPickup(pickup_id='999', external_id='EXT-999')

    with patch('shipping.packeta_client.create_courier_pickup', return_value=created):
        response = admin_client.post('/api/v1/admin/courier-pickups', {
            'orderIds': [str(order.id)],
            'pickupFrom': '2026-11-20T08:00:00Z',
            'pickupTo': '2026-11-20T12:00:00Z',
        }, format='json')

    assert response.status_code == 200
    assert response.data['pickup_id'] == '999'
    assert response.data['external_id'] == 'EXT-999'
    assert response.data['order_ids'] == [str(order.id)]


def test_admin_courier_pickup_endpoint_carrier_api_error_returns_502(admin_client, packeta_pickup_config, carrier):
    order = _bare_order(carrier=carrier, carrier_shipment_id='111')

    with patch('shipping.packeta_client.create_courier_pickup', side_effect=PacketaApiError('Neplatné apiPassword.')):
        response = admin_client.post('/api/v1/admin/courier-pickups', {
            'orderIds': [str(order.id)],
            'pickupFrom': '2026-11-20T08:00:00Z',
            'pickupTo': '2026-11-20T12:00:00Z',
        }, format='json')

    assert response.status_code == 502
    assert response.data['error']['code'] == 'CARRIER_API_ERROR'


def test_admin_courier_pickup_endpoint_missing_order_returns_422(admin_client, packeta_pickup_config):
    import uuid

    response = admin_client.post('/api/v1/admin/courier-pickups', {
        'orderIds': [str(uuid.uuid4())],
        'pickupFrom': '2026-11-20T08:00:00Z',
        'pickupTo': '2026-11-20T12:00:00Z',
    }, format='json')

    assert response.status_code == 422
    assert response.data['error']['code'] == 'ORDER_NOT_FOUND'
