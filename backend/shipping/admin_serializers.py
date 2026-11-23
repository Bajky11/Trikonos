from rest_framework import serializers

from core.exceptions import DuplicateQuantityDiscountError

from .models import (
    SHIPPING_PRICE_DELIVERY_TYPE_CHOICES,
    Carrier,
    CodSurcharge,
    PacketaConfig,
    ShippingPrice,
    ShippingQuantityDiscount,
)


class AdminCarrierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Carrier
        fields = ['id', 'name', 'code', 'position', 'is_active']

    def validate_code(self, value):
        return value.strip().upper()


class AdminShippingPriceSerializer(serializers.ModelSerializer):
    carrier_id = serializers.PrimaryKeyRelatedField(source='carrier', queryset=Carrier.objects.all())
    carrier_name = serializers.CharField(source='carrier.name', read_only=True)
    delivery_type = serializers.ChoiceField(choices=SHIPPING_PRICE_DELIVERY_TYPE_CHOICES)

    class Meta:
        model = ShippingPrice
        fields = ['id', 'carrier_id', 'carrier_name', 'delivery_type', 'price', 'updated_at']
        read_only_fields = ['updated_at']


class AdminCodSurchargeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodSurcharge
        fields = ['amount', 'updated_at']
        read_only_fields = ['updated_at']


class AdminPacketaConfigSerializer(serializers.ModelSerializer):
    # api_password is a third-party credential - never echo it back once
    # saved. api_password_set lets the frontend show "configured" vs "not
    # configured" without needing the plaintext value.
    api_password_set = serializers.SerializerMethodField()

    class Meta:
        model = PacketaConfig
        fields = [
            'api_password', 'api_password_set', 'eshop', 'home_delivery_address_id', 'label_format',
            'pickup_address_id', 'pickup_company_name', 'pickup_contact_name', 'pickup_contact_surname',
            'pickup_email', 'pickup_phone', 'pickup_street', 'pickup_house_number', 'pickup_city', 'pickup_zip',
            'updated_at',
        ]
        read_only_fields = ['updated_at']
        extra_kwargs = {'api_password': {'write_only': True}}

    def get_api_password_set(self, obj) -> bool:
        return bool(obj.api_password)

    def validate_pickup_address_id(self, value):
        if value and (not value.isascii() or not value.isdecimal() or not 0 < int(value) <= 2**31 - 1):
            raise serializers.ValidationError('Zadejte platné číselné ID místa svozu.')
        return value


class AdminCourierPickupSerializer(serializers.Serializer):
    order_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=100)
    pickup_from = serializers.DateTimeField()
    pickup_to = serializers.DateTimeField()
    note = serializers.CharField(required=False, allow_blank=True, default='', max_length=500)

    def validate(self, attrs):
        if attrs['pickup_from'] >= attrs['pickup_to']:
            raise serializers.ValidationError({'pickup_to': 'Konec svozu musí být po začátku.'})
        if len(set(attrs['order_ids'])) != len(attrs['order_ids']):
            raise serializers.ValidationError({'order_ids': 'Objednávky se nesmí opakovat.'})
        return attrs


class AdminCourierPickupResultSerializer(serializers.Serializer):
    pickup_id = serializers.CharField()
    external_id = serializers.CharField()
    order_ids = serializers.ListField(child=serializers.UUIDField())


class AdminCourierPickupHistorySerializer(AdminCourierPickupResultSerializer):
    id = serializers.UUIDField()
    pickup_from = serializers.DateTimeField()
    pickup_to = serializers.DateTimeField()
    created_at = serializers.DateTimeField()


class AdminShippingQuantityDiscountSerializer(serializers.ModelSerializer):
    shipping_price_id = serializers.PrimaryKeyRelatedField(source='shipping_price', queryset=ShippingPrice.objects.all())

    class Meta:
        model = ShippingQuantityDiscount
        fields = ['id', 'shipping_price_id', 'min_quantity', 'discount_percent', 'position', 'is_active']
        # Disables DRF's auto-generated UniqueTogetherValidator (which would
        # report this as a generic 400) in favour of the 409 raised in
        # validate() below - a duplicate threshold is a conflict with
        # existing admin data, not a malformed request.
        validators = []

    def validate_discount_percent(self, value):
        if not (0 <= value <= 100):
            raise serializers.ValidationError('discount_percent must be between 0 and 100.')
        return value

    def validate(self, attrs):
        shipping_price = attrs.get('shipping_price', getattr(self.instance, 'shipping_price', None))
        min_quantity = attrs.get('min_quantity', getattr(self.instance, 'min_quantity', None))
        duplicate = ShippingQuantityDiscount.objects.filter(shipping_price=shipping_price, min_quantity=min_quantity)
        if self.instance is not None:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise DuplicateQuantityDiscountError()
        return attrs
