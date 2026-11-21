from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import viewsets
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from core.admin_lookup import LookupAdminViewSet, lookup_schema_view

from .admin_serializers import (
    AdminCarrierSerializer,
    AdminCodSurchargeSerializer,
    AdminCourierPickupResultSerializer,
    AdminCourierPickupSerializer,
    AdminPacketaConfigSerializer,
    AdminShippingPriceSerializer,
    AdminShippingQuantityDiscountSerializer,
)
from .models import Carrier, CodSurcharge, PacketaConfig, ShippingPrice, ShippingQuantityDiscount
from .services import order_courier_pickup


@lookup_schema_view(
    'dopravce', 'dopravců',
    extra_note=(
        '`code` se uloží velkými písmeny (interní kód pro integrační vrstvu, '
        'např. PACKETA). Cena dopravy se nastavuje zvlášť pro každou '
        'kombinaci dopravce a typu doručení (viz `/admin/shipping-prices`) - '
        'tahle tabulka slouží jen k výběru dopravce v checkoutu a u '
        'objednávky.'
    ),
    tag='Admin - doprava',
)
class AdminCarrierViewSet(LookupAdminViewSet):
    """Dopravci (Zásilkovna, DPD, ...), nabízení zákazníkovi při checkoutu."""
    queryset = Carrier.objects.all()
    serializer_class = AdminCarrierSerializer
    search_fields = ['name', 'code']


@lookup_schema_view(
    'cena dopravy', 'cen dopravy',
    extra_note=(
        'Jedna cena (haléře) pro každou kombinaci dopravce a typu doručení '
        '(`PICKUP_POINT`/`HOME_DELIVERY` - `PERSONAL_PICKUP` sem nepatří, je '
        'vždy zdarma bez ohledu na cokoliv tady nastavené). Bez řádku pro '
        'danou kombinaci zůstává `shippingCost` u objednávky/košíku `null` a '
        'cenu dopravy nastavuje admin ručně, jako doteď. Duplicitní '
        'kombinace dopravce + typu doručení vrátí 400.'
    ),
    tag='Admin - doprava',
)
class AdminShippingPriceViewSet(LookupAdminViewSet):
    """Ceny dopravy podle dopravce a typu doručení."""
    queryset = ShippingPrice.objects.select_related('carrier').all()
    serializer_class = AdminShippingPriceSerializer

    def get_queryset(self):
        # Not calling super().get_queryset(): LookupAdminViewSet orders by
        # ('position', 'name') which this model doesn't have.
        queryset = self.queryset
        carrier_id = self.request.query_params.get('carrier')
        if carrier_id:
            queryset = queryset.filter(carrier_id=carrier_id)
        return queryset.order_by('carrier__name', 'delivery_type')


@extend_schema_view(
    list=extend_schema(
        tags=['Admin - doprava'],
        summary='Zobrazit příplatek za dobírku',
        description=(
            'Jednotný příplatek (haléře) připočítaný k `shippingCost`, '
            'kdykoli je `paymentMethod: CASH_ON_DELIVERY` - dopravce si za '
            'výběr hotovosti účtuje poplatek, tohle umožňuje ho přenést na '
            'zákazníka. `amount: 0` (výchozí) = žádný příplatek. Nikdy se '
            'nepřičítá u `PERSONAL_PICKUP` (osobní odběr je vždy zdarma, '
            'žádný dopravce peníze nevybírá).'
        ),
        responses={200: AdminCodSurchargeSerializer},
    ),
    update=extend_schema(
        tags=['Admin - doprava'],
        summary='Nastavit příplatek za dobírku',
        description='Vyžaduje přihlášení do administrace.',
        request=AdminCodSurchargeSerializer,
        responses={200: AdminCodSurchargeSerializer},
    ),
)
class AdminCodSurchargeView(viewsets.ViewSet):
    """GET/PUT /admin/cod-surcharge - singleton příplatek za dobírku."""
    permission_classes = [IsAdmin]

    def list(self, request):
        serializer = AdminCodSurchargeSerializer(CodSurcharge.get_solo())
        return Response(serializer.data)

    def update(self, request):
        instance = CodSurcharge.get_solo()
        serializer = AdminCodSurchargeSerializer(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(
        tags=['Admin - doprava'],
        summary='Zobrazit nastavení Packety',
        description=(
            'Přihlašovací údaje a nastavení pro napojení na Packeta '
            '(Zásilkovna) API (viz `shipping/packeta_client.py`) - jsou to '
            'citlivé údaje. `apiPassword: ""` znamená, že '
            'integrace ještě není nastavená - vytvoření zásilky pak selže '
            's jasnou chybou.\n\n'
            '`eshop` (potřebné jen má-li účet víc odesílatelů) je textové '
            '**"Označení"** odesílatele z klientské zóny Packety, sekce '
            'Odesílatelé/Senders (např. `"Trikonoš"`) - NE číselné '
            '"Odesílatel ID" ze stejné tabulky. Zadání číselného ID selže '
            's chybou `eshop_id: Není zadán odesilatel zásilky. Prosíme '
            'vyberte jej.` (ověřeno v praxi).\n\n'
            '`homeDeliveryAddressId` je ID externího '
            'dopravce pro doručení na adresu (ne ID výdejního místa) - '
            'dostanete ho z klientské zóny Packety, nejde ho uhodnout. Pro '
            'doručení na výdejní místo stačí jen `apiPassword`.\n\n'
            'Pole `pickup*` (`pickupAddressId` + adresa provozovny) se '
            'použijí při objednání svozu přes `POST /admin/courier-pickups` '
            '- nastavují se tady jednou, ne při každém svozu zvlášť.'
        ),
        responses={200: AdminPacketaConfigSerializer},
    ),
    update=extend_schema(
        tags=['Admin - doprava'],
        summary='Nastavit napojení na Packetu',
        description='Vyžaduje přihlášení do administrace.',
        request=AdminPacketaConfigSerializer,
        responses={200: AdminPacketaConfigSerializer},
    ),
)
class AdminPacketaConfigView(viewsets.ViewSet):
    """GET/PUT /admin/packeta-config - singleton nastavení napojení na Packetu."""
    permission_classes = [IsAdmin]

    def list(self, request):
        serializer = AdminPacketaConfigSerializer(PacketaConfig.get_solo())
        return Response(serializer.data)

    def update(self, request):
        instance = PacketaConfig.get_solo()
        serializer = AdminPacketaConfigSerializer(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@lookup_schema_view(
    'slevový práh', 'slevových prahů',
    extra_note=(
        '`shippingPriceId` (povinné) určuje, ke které kombinaci dopravce + '
        'typu doručení práh patří - každá kombinace má svou vlastní sadu '
        'prahů (viz `/admin/shipping-prices`). `minQuantity` je celkový '
        'počet kusů v objednávce (součet `quantity` přes všechny položky), '
        'od kterého práh platí, unikátní jen uvnitř jedné `shippingPriceId`. '
        '`discountPercent` 0-100 (`100` = doprava od tohoto počtu kusů '
        'zdarma) se odečítá ze základní ceny té kombinace. Platí práh s '
        'nejvyšším `minQuantity`, který objednávka splňuje; bez shody platí '
        'plná cena. Duplicitní `minQuantity` v rámci jedné `shippingPriceId` '
        'vrátí 409 (jinak by nebylo jednoznačné, který práh platí).'
    ),
    tag='Admin - doprava',
)
class AdminShippingQuantityDiscountViewSet(LookupAdminViewSet):
    """Slevové prahy dopravy podle počtu kusů v objednávce, pro danou kombinaci dopravce + typu doručení."""
    queryset = ShippingQuantityDiscount.objects.select_related('shipping_price__carrier').all()
    serializer_class = AdminShippingQuantityDiscountSerializer

    def get_queryset(self):
        # Not calling super().get_queryset(): LookupAdminViewSet orders by
        # ('position', 'name') which this model doesn't have - order by the
        # quantity threshold instead, which is what actually determines
        # which tier applies.
        queryset = self.queryset
        is_active = self.request.query_params.get('isActive')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))
        shipping_price_id = self.request.query_params.get('shippingPriceId')
        if shipping_price_id:
            queryset = queryset.filter(shipping_price_id=shipping_price_id)

        return queryset.order_by('min_quantity')


@extend_schema_view(
    create=extend_schema(
        tags=['Admin - doprava'],
        summary='Objednat svoz zásilek u Packety',
        description=(
            'Zavolá Packeta API (`createCourierPickup`) a objedná svoz pro '
            'víc objednávek najednou - na rozdíl od založení zásilky, '
            'štítku a sledování stavu (ty se dělají po jedné na '
            '`/admin/orders/{id}/shipment...`), svoz se neobjednává pro '
            'každou objednávku zvlášť a nestane se při každé objednávce. '
            'Všechny `orderIds` musí mít už založenou zásilku u Packety, '
            'jinak 422 `SHIPMENT_NOT_CREATED`; neexistující id vrátí 422 '
            '`ORDER_NOT_FOUND`. Adresa, ze které se sváží, se nastavuje '
            'jednou v `/admin/packeta-config` (pole `pickup*`), ne tady - '
            'bez ní 422. `pickupFrom`/`pickupTo` je časové okno, kdy může '
            'kurýr dorazit. Vrací `pickupId`/`externalId` přidělené '
            'Packetou.'
        ),
        request=AdminCourierPickupSerializer,
        responses={
            200: AdminCourierPickupResultSerializer,
            422: OpenApiResponse(
                description='ORDER_NOT_FOUND / SHIPMENT_NOT_CREATED - viz chybová zpráva, které objednávky.',
            ),
            502: OpenApiResponse(description='CARRIER_API_ERROR - Packeta vrátila chybu.'),
        },
    ),
)
class AdminCourierPickupView(viewsets.ViewSet):
    """POST /admin/courier-pickups - objednání svozu zásilek u Packety pro víc objednávek najednou."""
    permission_classes = [IsAdmin]

    def create(self, request):
        serializer = AdminCourierPickupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result, orders = order_courier_pickup(
            data['order_ids'], pickup_from=data['pickup_from'], pickup_to=data['pickup_to'],
            note=data.get('note', ''),
        )
        response_data = AdminCourierPickupResultSerializer({
            'pickup_id': result.pickup_id,
            'external_id': result.external_id,
            'order_ids': [order.id for order in orders],
        }).data
        return Response(response_data)
