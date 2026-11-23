from django.urls import path

from .admin_views import AdminDashboardView, AdminRevenueStatsView, AdminSearchView, AdminTopMotifsStatsView

urlpatterns = [
    path('search', AdminSearchView.as_view(), name='admin-search'),
    path('dashboard', AdminDashboardView.as_view(), name='admin-dashboard'),
    path('stats/revenue', AdminRevenueStatsView.as_view(), name='admin-stats-revenue'),
    path('stats/top-motifs', AdminTopMotifsStatsView.as_view(), name='admin-stats-top-motifs'),
]
