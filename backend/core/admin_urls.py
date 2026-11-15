from django.urls import path

from .admin_views import AdminDashboardView, AdminSearchView

urlpatterns = [
    path('search', AdminSearchView.as_view(), name='admin-search'),
    path('dashboard', AdminDashboardView.as_view(), name='admin-dashboard'),
]
