from django.urls import path
from rest_framework.routers import DefaultRouter

from .admin_garment_offer import AdminGarmentOfferView
from .admin_garment_mockups import AdminGarmentMockupView

from .admin_views import (
    AdminCategoryViewSet,
    AdminColorViewSet,
    AdminCutViewSet,
    AdminPrintAreaViewSet,
    AdminProductTypeViewSet,
)

router = DefaultRouter(trailing_slash=False)
router.register('categories', AdminCategoryViewSet, basename='admin-category')
router.register('colors', AdminColorViewSet, basename='admin-color')
router.register('cuts', AdminCutViewSet, basename='admin-cut')
router.register('product-types', AdminProductTypeViewSet, basename='admin-product-type')
router.register('print-areas', AdminPrintAreaViewSet, basename='admin-print-area')

urlpatterns = [
    path('garment-offer', AdminGarmentOfferView.as_view(), name='admin-garment-offer'),
    path('garment-mockups/<uuid:product_type_id>/<uuid:cut_id>', AdminGarmentMockupView.as_view()),
] + router.urls
