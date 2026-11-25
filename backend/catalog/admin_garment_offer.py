from hashlib import sha256

from django.db import connection, transaction
from django.utils.translation import gettext as _
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from core.exceptions import BusinessError
from orders.models.choices import Size

from .availability import VARIANT_FIELDS
from .models import Color, Cut, GarmentVariant, ProductType
from .serializers import MotifVariantRefSerializer


class GarmentOfferConflict(BusinessError):
    status_code = 409
    default_code = 'GARMENT_OFFER_CHANGED'
    default_detail = _('The garment offer changed. Reload it before saving.')


class GarmentOfferSerializer(serializers.Serializer):
    revision = serializers.CharField(max_length=64)
    variants = MotifVariantRefSerializer(many=True)

    def validate_variants(self, variants):
        keys = {tuple(row[field] for field in VARIANT_FIELDS) for row in variants}
        if len(keys) != len(variants):
            raise serializers.ValidationError(_('The offer contains duplicate combinations.'))
        if any(row['size'] not in Size.values for row in variants):
            raise serializers.ValidationError(_('The offer contains an unsupported size.'))
        for field, model in zip(VARIANT_FIELDS, (ProductType, Cut, Color)):
            ids = {row[field] for row in variants}
            if model.objects.filter(pk__in=ids).count() != len(ids):
                raise serializers.ValidationError(_('The offer refers to an unknown clothing option.'))
        return variants


def snapshot():
    rows = list(GarmentVariant.objects.order_by(*VARIANT_FIELDS).values('id', *VARIANT_FIELDS))
    revision = sha256(','.join(str(row['id']) for row in rows).encode()).hexdigest()
    return revision, rows


class AdminGarmentOfferView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(responses=GarmentOfferSerializer, tags=['Admin - varianty'])
    def get(self, request):
        revision, rows = snapshot()
        return Response(GarmentOfferSerializer({'revision': revision, 'variants': rows}).data)

    @extend_schema(request=GarmentOfferSerializer, responses=GarmentOfferSerializer, tags=['Admin - varianty'])
    @transaction.atomic
    def put(self, request):
        # Serialize updates even when the offer is empty without blocking reads.
        with connection.cursor() as cursor:
            cursor.execute('LOCK TABLE garment_variants IN SHARE ROW EXCLUSIVE MODE')
        revision, rows = snapshot()
        serializer = GarmentOfferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if revision != serializer.validated_data['revision']:
            raise GarmentOfferConflict()

        def key(row):
            return tuple(row[field] for field in VARIANT_FIELDS)

        desired = {key(row): row for row in serializer.validated_data['variants']}
        current = {key(row): row['id'] for row in rows}
        GarmentVariant.objects.filter(pk__in=[current[k] for k in current.keys() - desired.keys()]).delete()
        GarmentVariant.objects.bulk_create(
            [GarmentVariant(**desired[k]) for k in desired.keys() - current.keys()], batch_size=1000,
        )
        return self.get(request)
