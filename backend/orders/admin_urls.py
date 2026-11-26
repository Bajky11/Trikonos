from django.urls import path
from rest_framework.routers import DefaultRouter

from .admin_production_views import ProductionItemStatusView, ProductionOrdersView, ProductionPlacementsView, ProductionStartView, ProductionSummaryView
from .admin_views import AdminCustomPrintPriceView, AdminOrderViewSet

router = DefaultRouter(trailing_slash=False)
router.register('orders', AdminOrderViewSet, basename='admin-order')

urlpatterns = [
    path('production/summary', ProductionSummaryView.as_view(), name='admin-production-summary'),
    path('production/orders', ProductionOrdersView.as_view(), name='admin-production-orders'),
    path('production/orders/<uuid:order_id>/start', ProductionStartView.as_view(), name='admin-production-start'),
    path('production/orders/<uuid:order_id>/items/<uuid:item_id>', ProductionItemStatusView.as_view(), name='admin-production-item-status'),
    path('production/placements', ProductionPlacementsView.as_view(), name='admin-production-placements'),
    path(
        'custom-print-price',
        AdminCustomPrintPriceView.as_view({'get': 'retrieve', 'put': 'update'}),
        name='admin-custom-print-price',
    ),
] + router.urls
