from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .availability import offered_garments, VARIANT_FIELDS
from .models import Category, Motif


class CategorySerializer(serializers.ModelSerializer):
    """Public shape. `motif_count` is annotated on the viewset's queryset -
    counting only active motifs, not a raw reverse-FK count.
    """
    motif_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'position', 'motif_count']


class MotifCategoryRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['name', 'slug']


class MotifListSerializer(serializers.ModelSerializer):
    category = MotifCategoryRefSerializer(read_only=True)
    currency = serializers.SerializerMethodField()
    main_image = serializers.SerializerMethodField()

    class Meta:
        model = Motif
        fields = ['id', 'slug', 'name', 'price', 'currency', 'main_image', 'category']

    def get_currency(self, obj) -> str:
        return 'CZK'

    def get_main_image(self, obj) -> str | None:
        images = obj.images or []
        return images[0]['url'] if images else obj.design_image.url if obj.design_image else None


class MotifVariantRefSerializer(serializers.Serializer):
    product_type_id = serializers.UUIDField()
    cut_id = serializers.UUIDField()
    color_id = serializers.UUIDField()
    size = serializers.CharField()


class MotifImageSerializer(serializers.Serializer):
    url = serializers.CharField()
    alt_text = serializers.CharField(required=False, allow_blank=True)
    color_id = serializers.UUIDField(required=False, allow_null=True)
    product_type_id = serializers.UUIDField(required=False, allow_null=True)
    cut_id = serializers.UUIDField(required=False, allow_null=True)


@extend_schema_field(MotifImageSerializer(many=True))
class MotifImagesField(serializers.JSONField):
    """Document the existing JSON shape without changing its representation."""


class MotifDetailSerializer(serializers.ModelSerializer):
    default_color_id = serializers.UUIDField(read_only=True, allow_null=True)
    design_image_url = serializers.ImageField(source='design_image', read_only=True, allow_null=True)
    category = MotifCategoryRefSerializer(read_only=True)
    currency = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()
    images = MotifImagesField(read_only=True)

    class Meta:
        model = Motif
        fields = ['id', 'slug', 'name', 'description', 'price', 'currency', 'images', 'category', 'variants', 'design_image_url', 'default_color_id']

    def get_currency(self, obj) -> str:
        return 'CZK'

    @extend_schema_field(MotifVariantRefSerializer(many=True))
    def get_variants(self, obj):
        return MotifVariantRefSerializer(
            offered_garments(obj).order_by(*VARIANT_FIELDS), many=True,
        ).data


class CatalogOptionPrintAreaSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    width_mm = serializers.IntegerField()
    height_mm = serializers.IntegerField()


class CatalogOptionProductTypeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    price = serializers.IntegerField()
    print_areas = CatalogOptionPrintAreaSerializer(many=True)


class CatalogOptionCutSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class CatalogOptionColorSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    hex_value = serializers.CharField()


class CatalogOptionSizeSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()


class CatalogOptionCarrierSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    code = serializers.CharField()


class GarmentMockupSerializer(serializers.Serializer):
    product_type_id = serializers.UUIDField()
    cut_id = serializers.UUIDField()
    url = serializers.CharField()


class CatalogOptionsResponseSerializer(serializers.Serializer):
    garment_variants = MotifVariantRefSerializer(many=True)
    garment_mockups = GarmentMockupSerializer(many=True, required=False)
    product_types = CatalogOptionProductTypeSerializer(many=True)
    cuts = CatalogOptionCutSerializer(many=True)
    colors = CatalogOptionColorSerializer(many=True)
    sizes = CatalogOptionSizeSerializer(many=True)
    carriers = CatalogOptionCarrierSerializer(many=True)
