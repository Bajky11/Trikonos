from django.utils.text import slugify
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.exceptions import FileTooLargeError

from .models import Category, Color, Motif

MOTIF_IMAGE_MAX_SIZE = 10 * 1024 * 1024


class AdminMotifImageSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    url = serializers.CharField()
    thumbnail_small_url = serializers.CharField()
    thumbnail_large_url = serializers.CharField()
    alt_text = serializers.CharField(allow_blank=True)
    color_id = serializers.UUIDField(allow_null=True)
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

    class Meta:
        model = Motif
        fields = ['id', 'name', 'slug', 'price', 'category', 'position', 'is_active', 'orders_count', 'created_at']


class AdminMotifDetailSerializer(serializers.ModelSerializer):
    images = AdminMotifImagesField(read_only=True)
    category = AdminMotifCategoryRefSerializer(read_only=True)
    orders_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Motif
        fields = [
            'id', 'name', 'slug', 'description', 'price', 'images', 'category',
            'position', 'is_active', 'orders_count', 'created_at', 'updated_at',
        ]


class AdminMotifWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Motif
        fields = ['id', 'name', 'slug', 'description', 'price', 'category', 'position', 'is_active']
        extra_kwargs = {'slug': {'required': False}, 'description': {'required': False}}

    def validate(self, attrs):
        if not attrs.get('slug'):
            name = attrs.get('name') or getattr(self.instance, 'name', '')
            attrs['slug'] = slugify(name)
            if not attrs['slug']:
                raise serializers.ValidationError({'slug': _('A URL slug could not be generated. Enter it explicitly.')})

        queryset = Motif.objects.filter(slug=attrs['slug'])
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError({'slug': _('This slug already exists.')})
        return attrs


@extend_schema_field({'type': 'string', 'format': 'binary'})
class UploadedImageField(serializers.ImageField):
    pass


class MotifImageUploadSerializer(serializers.Serializer):
    file = UploadedImageField()
    alt_text = serializers.CharField(required=False, allow_blank=True, default='')
    color_id = serializers.PrimaryKeyRelatedField(
        source='color', queryset=Color.objects.all(), required=False, allow_null=True, default=None,
    )

    def validate_file(self, value):
        if value.size > MOTIF_IMAGE_MAX_SIZE:
            raise FileTooLargeError()
        return value


class MotifImagePatchSerializer(serializers.Serializer):
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
