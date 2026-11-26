from django.utils.text import slugify
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.exceptions import FileTooLargeError
from orders.models.choices import Size

from .availability import VARIANT_FIELDS, offered_garments
from .models import Category, Color, Cut, Motif, ProductType

MOTIF_IMAGE_MAX_SIZE = 10 * 1024 * 1024


class AdminMotifImageSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    url = serializers.CharField()
    thumbnail_small_url = serializers.CharField()
    thumbnail_large_url = serializers.CharField()
    alt_text = serializers.CharField(allow_blank=True)
    color_id = serializers.UUIDField(allow_null=True)
    product_type_id = serializers.UUIDField(required=False, allow_null=True)
    cut_id = serializers.UUIDField(required=False, allow_null=True)
    position = serializers.IntegerField()


@extend_schema_field(AdminMotifImageSerializer(many=True))
class AdminMotifImagesField(serializers.JSONField):
    """Describe stored image metadata without changing its representation."""


class AdminMotifCategoryRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']


class AdminMotifListSerializer(serializers.ModelSerializer):
    category = AdminMotifCategoryRefSerializer(read_only=True)
    orders_count = serializers.IntegerField(read_only=True)
    design_image_url = serializers.ImageField(source='design_image', read_only=True, allow_null=True)

    class Meta:
        model = Motif
        fields = [
            'id', 'name', 'slug', 'price', 'category', 'position', 'is_active',
            'orders_count', 'created_at', 'design_image_url',
        ]


class GarmentExclusionSerializer(serializers.Serializer):
    product_type_id = serializers.UUIDField()
    cut_id = serializers.UUIDField()
    color_id = serializers.UUIDField(required=False)
    size = serializers.ChoiceField(choices=Size.choices, required=False)

    def validate(self, attrs):
        if 'color_id' in attrs and 'size' in attrs:
            raise serializers.ValidationError(_('Exclude either a color or a size, not both.'))
        return {key: str(value) for key, value in attrs.items()}


class AdminMotifDetailSerializer(serializers.ModelSerializer):
    default_color_id = serializers.UUIDField(read_only=True, allow_null=True)
    design_image_url = serializers.ImageField(source='design_image', read_only=True, allow_null=True)
    images = AdminMotifImagesField(read_only=True)
    category = AdminMotifCategoryRefSerializer(read_only=True)
    orders_count = serializers.IntegerField(read_only=True, default=0)
    garment_exclusions = GarmentExclusionSerializer(many=True, read_only=True)

    class Meta:
        model = Motif
        fields = [
            'id', 'name', 'slug', 'description', 'price', 'images', 'category',
            'position', 'is_active', 'orders_count', 'created_at', 'updated_at',
            'garment_exclusions', 'design_image_url', 'default_color_id',
        ]


class AdminMotifWriteSerializer(serializers.ModelSerializer):
    default_color_id = serializers.PrimaryKeyRelatedField(
        source='default_color', queryset=Color.objects.all(), required=False, allow_null=True,
    )
    garment_exclusions = GarmentExclusionSerializer(many=True, required=False, max_length=2000)
    copy_restrictions_from = serializers.PrimaryKeyRelatedField(
        queryset=Motif.objects.all(), required=False, write_only=True,
    )

    class Meta:
        model = Motif
        fields = [
            'id', 'name', 'slug', 'description', 'price', 'category', 'position', 'is_active',
            'garment_exclusions', 'copy_restrictions_from', 'default_color_id',
        ]
        extra_kwargs = {'slug': {'required': False}, 'description': {'required': False}}

    def validate(self, attrs):
        source = attrs.get('copy_restrictions_from')
        if source and self.instance:
            raise serializers.ValidationError({'copy_restrictions_from': _('Only available on creation.')})
        original = source or self.instance
        if 'garment_exclusions' in attrs:
            rules = attrs['garment_exclusions']
            existing = getattr(original, 'garment_exclusions', [])
            if len({tuple(sorted(rule.items())) for rule in rules}) != len(rules):
                raise serializers.ValidationError({'garment_exclusions': _('Duplicate exclusions.')})
            available = set()
            for product_type, cut, color, size in offered_garments().values_list(*VARIANT_FIELDS):
                pair = (str(product_type), str(cut))
                available.update((pair + (None, None), pair + (str(color), None), pair + (None, size)))
            if any(rule not in existing and (
                rule['product_type_id'], rule['cut_id'], rule.get('color_id'), rule.get('size'),
            ) not in available for rule in rules):
                raise serializers.ValidationError({'garment_exclusions': _('An excluded option is no longer offered. Reload the offer.')})
        elif source:
            attrs['garment_exclusions'] = source.garment_exclusions
        default_color = attrs.get('default_color')
        if default_color and default_color.pk != getattr(self.instance, 'default_color_id', None):
            candidate = Motif(garment_exclusions=attrs.get('garment_exclusions', getattr(original, 'garment_exclusions', [])))
            if not offered_garments(candidate).filter(color=default_color).exists():
                raise serializers.ValidationError({'default_color_id': _('Select a color offered for this motif.')})
        elif source and 'default_color' not in attrs:
            attrs['default_color_id'] = source.default_color_id
        if not attrs.get('slug'):
            name = attrs.get('name')
            attrs['slug'] = self.instance.slug if self.instance and not name else slugify(name or '')
            if not attrs['slug']:
                raise serializers.ValidationError({'slug': _('A URL slug could not be generated. Enter it explicitly.')})

        queryset = Motif.objects.filter(slug=attrs['slug'])
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError({'slug': _('This slug already exists.')})
        return attrs

    def create(self, validated_data):
        validated_data.pop('copy_restrictions_from', None)
        return super().create(validated_data)


@extend_schema_field({'type': 'string', 'format': 'binary'})
class UploadedImageField(serializers.ImageField):
    pass


class MotifImageGarmentSerializer(serializers.Serializer):
    product_type_id = serializers.PrimaryKeyRelatedField(source='product_type', queryset=ProductType.objects.all(), required=False, allow_null=True)
    cut_id = serializers.PrimaryKeyRelatedField(source='cut', queryset=Cut.objects.all(), required=False, allow_null=True)

    def validate(self, attrs):
        if ('product_type' in attrs or 'cut' in attrs) and (
            'product_type' not in attrs or 'cut' not in attrs
            or bool(attrs['product_type']) != bool(attrs['cut'])
        ):
            raise serializers.ValidationError(_('Select both the garment type and cut, or neither.'))
        return attrs


class MotifImageUploadSerializer(MotifImageGarmentSerializer):
    file = UploadedImageField()
    alt_text = serializers.CharField(required=False, allow_blank=True, default='')
    color_id = serializers.PrimaryKeyRelatedField(
        source='color', queryset=Color.objects.all(), required=False, allow_null=True, default=None,
    )

    def validate_file(self, value):
        if value.size > MOTIF_IMAGE_MAX_SIZE:
            raise FileTooLargeError()
        return value


class MotifImagePatchSerializer(MotifImageGarmentSerializer):
    alt_text = serializers.CharField(required=False, allow_blank=True)
    color_id = serializers.PrimaryKeyRelatedField(
        source='color', queryset=Color.objects.all(), required=False, allow_null=True,
    )


class MotifImageReorderSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)

    def validate_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError(_('Image ids must be unique.'))
        return value
