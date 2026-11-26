from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.models import DeliveryType, PaymentMethod
from orders.comgate import enabled as comgate_enabled
from shipping.models import PacketaConfig

from .emails import send_templated_email
from .exceptions import ContactUnavailableError


# Packeta CZ Home Delivery: https://docs.packeta.com/docs/destination-country/cz/cz-home-delivery
PACKETA_CZ_HD_WIDGET_CARRIER_ID = '106'


class ChoiceOptionSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()


class PacketaHomeDeliverySerializer(serializers.Serializer):
    api_key = serializers.CharField()
    carrier_id = serializers.CharField()


class ConfigResponseSerializer(serializers.Serializer):
    shop_name = serializers.CharField()
    contact_email = serializers.CharField()
    contact_phone = serializers.CharField()
    instagram_url = serializers.CharField()
    bank_account = serializers.CharField()
    terms_url = serializers.CharField(allow_blank=True, help_text='URL schválených obchodních podmínek; prázdná hodnota blokuje checkout ve frontendu.')
    topbar_text = serializers.CharField()
    payment_methods = ChoiceOptionSerializer(many=True)
    delivery_types = ChoiceOptionSerializer(many=True)
    packeta_home_delivery = PacketaHomeDeliverySerializer(required=False)


class ConfigView(APIView):
    """Veřejná konfigurace obchodu a pokladny."""
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Konfigurace'],
        summary='Konfigurace obchodu pro hlavičku, patičku a checkout',
        description=(
            'Vrací statické texty a hodnoty, které frontend potřebuje na víc místech '
            'a nemění se podle uživatele: text horní lišty, kontaktní e-mail a telefon, '
            'odkaz na Instagram, číslo bankovního účtu (pro zobrazení platebních '
            'instrukcí) a číselníky `paymentMethods`/`deliveryTypes` s českými popisky '
            '(`value` = hodnota, kterou posíláš v `POST /orders`, `label` = text pro '
            'uživatele). Volej jednou při startu appky, výsledek je bezpečné cachovat - '
            'hodnoty se mění jen při změně nastavení obchodu nebo dopravy.'
        ),
        responses={200: ConfigResponseSerializer},
    )
    def get(self, request):
        shop = settings.SHOP_CONFIG
        config = {
            'shop_name': shop['NAME'],
            'contact_email': shop['CONTACT_EMAIL'],
            'contact_phone': shop['CONTACT_PHONE'],
            'instagram_url': shop['INSTAGRAM_URL'],
            'bank_account': shop['BANK_ACCOUNT'],
            'terms_url': shop.get('TERMS_URL', ''),
            'topbar_text': shop['TOPBAR_TEXT'],
            'payment_methods': [
                {'value': value, 'label': label} for value, label in PaymentMethod.choices
                if value != PaymentMethod.CARD_ONLINE or comgate_enabled()
            ],
            'delivery_types': [
                {'value': value, 'label': label} for value, label in DeliveryType.choices
            ],
        }
        api_key = shop.get('PACKETA_WIDGET_API_KEY', '').strip()
        if api_key:
            carrier_id = PacketaConfig.objects.filter(pk=1).values_list('home_delivery_address_id', flat=True).first()
            if not (carrier_id and carrier_id.isascii() and carrier_id.isdecimal() and int(carrier_id) > 0):
                # The checkout widget does not need shipment creation to be configured.
                carrier_id = PACKETA_CZ_HD_WIDGET_CARRIER_ID
            config['packeta_home_delivery'] = {'api_key': api_key, 'carrier_id': carrier_id}
        return Response(config)


class ContactSerializer(serializers.Serializer):
    name = serializers.CharField()
    email = serializers.EmailField()
    phone = serializers.CharField(required=False, allow_blank=True, default='')
    company = serializers.CharField(required=False, allow_blank=True, default='')
    message = serializers.CharField()
    # Honeypot - hidden on the real form, bots tend to fill every field.
    website = serializers.CharField(required=False, allow_blank=True, default='')


class ContactView(APIView):
    """Kontaktní formulář - jen pošle e-mail, nic neukládá."""
    permission_classes = [AllowAny]
    throttle_scope = 'public-write'

    @extend_schema(
        tags=['Konfigurace'],
        summary='Odeslat kontaktní/poptávkový formulář',
        description=(
            'Pro stránku "Kontakt" nebo "Poptat tým" bez průchodu editorem vlastního '
            'potisku. Nic se neukládá do databáze - endpoint jen pošle e-mail na adresu '
            'obchodu (`SHOP_NOTIFY_EMAIL`). Pole `website` je honeypot proti botům: '
            'na frontendu ho schovej (např. `display:none`) a nech prázdné - člověk ho '
            'nevyplní, bot často ano. Pokud je vyplněné, endpoint tiše vrátí 204 a nic '
            'neodešle (bot se to nedozví). Úspěch i honeypot vrací 204; chybějící '
            'příjemce nebo selhání e-mailového backendu vrací 503.'
        ),
        request=ContactSerializer,
        responses={
            204: OpenApiResponse(description='Zpráva předána e-mailovému backendu (nebo honeypot tiše ignorován).'),
            503: OpenApiResponse(description='Odesílání zpráv není dostupné.'),
        },
    )
    def post(self, request):
        serializer = ContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data['website']:
            return Response(status=status.HTTP_204_NO_CONTENT)

        notify_email = settings.SHOP_CONFIG['NOTIFY_EMAIL']
        if not notify_email:
            raise ContactUnavailableError()
        try:
            send_templated_email(
                'contact_message',
                {
                    'name': data['name'],
                    'email': data['email'],
                    'phone': data.get('phone', ''),
                    'company': data.get('company', ''),
                    'message': data['message'],
                },
                subject=f'Zpráva z kontaktního formuláře - {data["name"]}',
                recipient_list=[notify_email],
                raise_on_failure=True,
            )
        except Exception as exc:
            raise ContactUnavailableError() from exc
        return Response(status=status.HTTP_204_NO_CONTENT)
