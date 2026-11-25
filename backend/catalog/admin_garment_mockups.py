from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from .mockups import MockupUploadSerializer, delete_after_commit, save_mockup
from .models import Cut, GarmentMockup, ProductType


class AdminGarmentMockupView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser]

    @extend_schema(operation_id='adminGarmentMockupUpdate', request=MockupUploadSerializer, responses={204: None})
    @transaction.atomic
    def put(self, request, product_type_id, cut_id):
        upload = MockupUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        product_type = get_object_or_404(ProductType.objects.select_for_update(), pk=product_type_id)
        cut = get_object_or_404(Cut, pk=cut_id)
        mockup = GarmentMockup.objects.filter(product_type=product_type, cut=cut).first()
        if mockup:
            delete_after_commit(mockup.image)
        else:
            mockup = GarmentMockup(product_type=product_type, cut=cut)
        save_mockup(mockup.image, upload.validated_data['file'])
        mockup.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(operation_id='adminGarmentMockupDestroy', responses={204: None})
    @transaction.atomic
    def delete(self, request, product_type_id, cut_id):
        get_object_or_404(ProductType.objects.select_for_update(), pk=product_type_id)
        mockup = GarmentMockup.objects.filter(product_type_id=product_type_id, cut_id=cut_id).first()
        if mockup:
            mockup.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
