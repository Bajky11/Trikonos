from django.db import IntegrityError, transaction
from requests.exceptions import RequestException
from zeep.exceptions import TransportError

from core.exceptions import BusinessError, PacketaApiError

from .models import CodSurcharge, CourierPickup, CourierPickupPacket, PacketaConfig, ShippingPrice, ShippingQuantityDiscount


class CourierPickupConflict(BusinessError):
    status_code = 409
    default_code = 'COURIER_PICKUP_RESERVED'
    default_detail = 'Alespoň jedna zásilka už má záznam o svozu. Ověřte historii a stav u Packety; svoz neopakujte naslepo.'


def calculate_shipping_cost(*, carrier, delivery_type, payment_method, total_quantity):
    """Price depends on which carrier + delivery type was chosen, each with
    its own quantity discount tiers on top (e.g. 30+ pieces -30%, 50+ pieces
    free), plus a flat CodSurcharge on top of that when paying cash on
    delivery. Personal pickup at the shop is always free, no carrier, price
    row or surcharge involved - the customer pays in person, nothing for a
    carrier to collect. Returns the price in haléře, or None if either
    delivery hasn't been chosen yet (`carrier` is None) or admin hasn't
    configured a price for this pair - callers must treat None as
    "unknown", not as free shipping.
    """
    from orders.models import DeliveryType, PaymentMethod

    if delivery_type == DeliveryType.PERSONAL_PICKUP:
        return 0
    if carrier is None:
        return None

    price_row = ShippingPrice.objects.filter(carrier=carrier, delivery_type=delivery_type).first()
    if price_row is None:
        return None

    tier = price_row.quantity_discounts.filter(
        is_active=True, min_quantity__lte=total_quantity,
    ).order_by('-min_quantity').first()
    discount_percent = tier.discount_percent if tier else 0

    cost = price_row.price * (100 - discount_percent) // 100
    if payment_method == PaymentMethod.CASH_ON_DELIVERY:
        cost += CodSurcharge.get_solo().amount

    return cost


# ---------------------------------------------------------------------------
# Packeta packet creation - maps an Order onto Packeta's PacketAttributes.
# ---------------------------------------------------------------------------

def _split_street(street):
    """Packeta wants street and house number as separate fields; the shop
    only stores one combined `street` string. Best-effort split on the
    last whitespace-separated token (house numbers are always last in
    Czech addresses) - if that token isn't number-like, the whole address
    goes into `street` and `houseNumber` is left blank rather than guessing
    wrong.
    """
    parts = street.rsplit(' ', 1)
    if len(parts) == 2 and any(char.isdigit() for char in parts[1]):
        return parts[0], parts[1]
    return street, ''


def build_packet_attributes(order, *, weight, value=None):
    """Maps an Order onto Packeta's PacketAttributes for createPacket - the
    same method creates a packet for any delivery type, distinguished only
    by which fields are set here. Raises BusinessError if the order isn't
    ready for shipment creation (no carrier/delivery type) or home delivery
    isn't configured.
    """
    from orders.models import DeliveryType, PaymentMethod

    packeta_config = PacketaConfig.get_solo()

    if order.carrier is None or order.carrier.code != 'PACKETA':
        raise BusinessError('Zásilku lze přes toto rozhraní vytvořit jen pro dopravce Packeta.')
    if not order.delivery_type:
        raise BusinessError('Objednávka nemá nastavený typ doručení.')
    resolved_value = value if value is not None else order.total
    if resolved_value is None:
        raise BusinessError('Objednávka nemá stanovenou celkovou cenu - zadej pojistnou hodnotu (value) ručně.')

    attributes = {
        'number': order.order_number,
        'name': order.customer.first_name,
        'surname': order.customer.last_name,
        'email': order.customer.email,
        'phone': order.customer.phone,
        'currency': order.currency,
        'value': resolved_value / 100,
        'weight': weight,
    }
    if order.customer.company_name:
        attributes['company'] = order.customer.company_name
    if packeta_config.eshop:
        attributes['eshop'] = packeta_config.eshop
    if order.payment_method == PaymentMethod.CASH_ON_DELIVERY:
        attributes['cod'] = resolved_value / 100

    if order.delivery_type == DeliveryType.PICKUP_POINT:
        attributes['addressId'] = order.pickup_point_id
    else:
        home_delivery_address_id = packeta_config.home_delivery_address_id
        if not home_delivery_address_id:
            raise BusinessError(
                'Doručení na adresu u Packety není nakonfigurované - nastav homeDeliveryAddressId v '
                '/admin/packeta-config.',
            )
        street, house_number = _split_street(order.shipping_street)
        attributes.update({
            'addressId': home_delivery_address_id,
            'street': street,
            'houseNumber': house_number,
            'city': order.shipping_city,
            'zip': order.shipping_zip,
        })

    return attributes


# ---------------------------------------------------------------------------
# Packeta courier pickup (svoz) - orders a collection for a batch of orders
# at once, unlike createPacket/label/status which act on one order's
# shipment at a time (see orders.services.create_shipment and friends).
# ---------------------------------------------------------------------------

def order_courier_pickup(order_ids, *, pickup_from, pickup_to, note=''):
    """POST /admin/courier-pickups. Looks up the given orders' Packeta
    packet ids and asks Packeta to schedule a courier collection for all of
    them in one call. Raises BusinessError if any order_id doesn't exist,
    any matched order has no Packeta shipment yet, or the shop's pickup
    address isn't configured (PacketaConfig.pickup_*). Returns
    (CreatedCourierPickup, [Order, ...]) - the caller decides what to do
    with the matched orders (e.g. report which ones were included).
    """
    from orders.models import Order, OrderStatus, ShipmentStatus

    config = PacketaConfig.get_solo()
    if not config.pickup_address_id:
        raise BusinessError(
            'Adresa pro svoz u Packety není nakonfigurovaná - nastav pickupAddressId a '
            'ostatní pickup* údaje v /admin/packeta-config.',
        )

    orders = list(Order.objects.select_related('carrier').filter(id__in=order_ids))
    found_ids = {str(order.id) for order in orders}
    missing_ids = [str(order_id) for order_id in order_ids if str(order_id) not in found_ids]
    if missing_ids:
        raise BusinessError(f'Objednávky nenalezeny: {", ".join(missing_ids)}.', code='ORDER_NOT_FOUND')

    without_shipment = [order.order_number for order in orders if not order.carrier_shipment_id]
    if without_shipment:
        raise BusinessError(
            f'Objednávky bez založené zásilky u Packety: {", ".join(without_shipment)}.',
            code='SHIPMENT_NOT_CREATED',
        )

    if any(order.carrier is None or order.carrier.code != 'PACKETA' for order in orders):
        raise BusinessError('Svoz je pouze pro zásilky Packety.', code='COURIER_PICKUP_WRONG_CARRIER')
    if any(not order.carrier_shipment_id.isascii() or not order.carrier_shipment_id.isdecimal()
           or not 0 < int(order.carrier_shipment_id) <= 2**63 - 1 for order in orders):
        raise BusinessError('Některá zásilka nemá platné ID Packety.', code='COURIER_PICKUP_INVALID_PACKET')
    packet_ids = [int(order.carrier_shipment_id) for order in orders]
    if len(set(packet_ids)) != len(packet_ids):
        raise BusinessError('Několik objednávek sdílí stejné ID zásilky.', code='COURIER_PICKUP_INVALID_PACKET')

    pickup_address = {
        'companyName': config.pickup_company_name,
        'personName': config.pickup_contact_name,
        'personSurname': config.pickup_contact_surname,
        'email': config.pickup_email,
        'phone': config.pickup_phone,
        'street': config.pickup_street,
        'houseNumber': config.pickup_house_number,
        'city': config.pickup_city,
        'zip': config.pickup_zip,
    }

    from .packeta_client import create_courier_pickup

    existing = CourierPickupPacket.objects.filter(packet_id__in=packet_ids)
    if existing.exists():
        ids = set(existing.values_list('pickup_id', flat=True))
        if len(ids) == 1:
            previous = CourierPickup.objects.get(pk=ids.pop())
            claimed = set(previous.packets.values_list('packet_id', 'order_id'))
            if (previous.pickup_id and previous.pickup_from == pickup_from and previous.pickup_to == pickup_to
                    and claimed == set(zip(packet_ids, (order.id for order in orders)))):
                return previous, orders
        raise CourierPickupConflict()

    if any(order.shipment_status not in (ShipmentStatus.CREATED, ShipmentStatus.LABEL_PRINTED)
           or order.status in (OrderStatus.CANCELLED, OrderStatus.REFUNDED) for order in orders):
        raise BusinessError('Některá zásilka už není připravena ke svozu.', code='COURIER_PICKUP_INVALID_STATUS')

    if (not config.api_password or not config.pickup_address_id.isascii()
            or not config.pickup_address_id.isdecimal() or not 0 < int(config.pickup_address_id) <= 2**31 - 1
            or not all(pickup_address[field] for field in ('personName', 'personSurname', 'email', 'phone', 'street', 'houseNumber', 'city', 'zip'))):
        raise BusinessError('Doplňte platné údaje pro svoz a API heslo v nastavení Packety.', code='COURIER_PICKUP_NOT_CONFIGURED')

    try:
        with transaction.atomic():
            pickup = CourierPickup.objects.create(pickup_from=pickup_from, pickup_to=pickup_to)
            CourierPickupPacket.objects.bulk_create([
                CourierPickupPacket(pickup=pickup, order_id=order.id, packet_id=packet_id)
                for packet_id, order in sorted(zip(packet_ids, orders))
            ])
    except IntegrityError:
        if existing.exists():
            raise CourierPickupConflict() from None
        raise

    try:
        result = create_courier_pickup(
            address_id=int(config.pickup_address_id),
            pickup_address=pickup_address,
            pickup_date={'from': pickup_from, 'to': pickup_to},
            packet_ids=packet_ids,
            note=note,
        )
    except (RequestException, TransportError) as exc:
        raise PacketaApiError('Výsledek svozu není potvrzený. Ověřte jej přímo u Packety.') from exc
    pickup.pickup_id = result.pickup_id
    pickup.external_id = result.external_id
    pickup.save(update_fields=['pickup_id', 'external_id'])
    return result, orders