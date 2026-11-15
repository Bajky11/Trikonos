from datetime import timedelta

from django.db.models import Q, Sum
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from customers.models import Customer
from orders.models import Order, OrderStatus, PaymentMethod, PaymentStatus

from .admin_serializers import AdminDashboardResponseSerializer, AdminSearchResponseSerializer


class AdminSearchView(APIView):
    """Globální vyhledávání v administraci napříč objednávkami, zákazníky a motivy."""
    permission_classes = [IsAdmin]
    LIMIT = 5

    @extend_schema(
        tags=['Admin - přehled'],
        summary='Globální hledání (objednávky, zákazníci, motivy)',
        description=(
            'Určeno pro vyhledávací pole v horní liště administrace - jedno pole, tři '
            'typy výsledků najednou. Prohledává: objednávky (číslo objednávky, e-mail '
            'a jméno zákazníka, sledovací číslo), zákazníky (e-mail, jméno, firma, '
            'telefon) a motivy (název). Hledání je `icontains` (nerozlišuje velikost '
            'písmen, hledá podřetězec, ne jen přesnou shodu). Vrací max 5 výsledků '
            '**na každý typ** - není to stránkovaný seznam, je to rychlý náhled; pro '
            'kompletní seznam použij `GET /admin/orders`, `/admin/customers` nebo '
            '`/admin/motifs` s parametrem `q`. Bez parametru `q` (nebo prázdný) vrátí '
            'tři prázdná pole, ne chybu.'
        ),
        parameters=[OpenApiParameter('q', str, OpenApiParameter.QUERY, description='Hledaný text.')],
        responses={200: AdminSearchResponseSerializer},
    )
    def get(self, request):
        from catalog.models import Motif

        query = request.query_params.get('q', '').strip()
        if not query:
            return Response({'orders': [], 'customers': [], 'motifs': []})

        orders = Order.objects.select_related('customer').filter(
            Q(order_number__icontains=query)
            | Q(customer__email__icontains=query)
            | Q(customer__first_name__icontains=query)
            | Q(customer__last_name__icontains=query)
            | Q(tracking_number__icontains=query)
        )[:self.LIMIT]

        customers = Customer.objects.filter(
            Q(email__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(company_name__icontains=query)
            | Q(phone__icontains=query)
        )[:self.LIMIT]

        motifs = Motif.objects.filter(name__icontains=query)[:self.LIMIT]

        return Response({
            'orders': [
                {
                    'id': order.id, 'order_number': order.order_number,
                    'customer_email': order.customer.email, 'status': order.status,
                }
                for order in orders
            ],
            'customers': [
                {
                    'id': customer.id, 'email': customer.email,
                    'name': f'{customer.first_name} {customer.last_name}'.strip(),
                    'company_name': customer.company_name,
                }
                for customer in customers
            ],
            'motifs': [{'id': motif.id, 'name': motif.name, 'slug': motif.slug} for motif in motifs],
        })


_ORDERS_TO_PROCESS_STATUSES = [OrderStatus.NEW, OrderStatus.PAID, OrderStatus.PROCESSING]
_UNPAID_PAYMENT_METHODS = [PaymentMethod.BANK_TRANSFER, PaymentMethod.INVOICE]


class AdminDashboardView(APIView):
    """Karty a poslední objednávky pro úvodní stránku administrace."""
    permission_classes = [IsAdmin]

    @extend_schema(
        tags=['Admin - přehled'],
        summary='Dashboard: karty s přehledem a posledních 10 objednávek',
        description=(
            'Objednávky a tržby (součet `total`, mimo CANCELLED/REFUNDED) dnes a '
            'včera, noví zákazníci za posledních 7 dní, počet čekajících poptávek '
            '(`QUOTE_REQUESTED`), počet objednávek k vyřízení (`NEW`+`PAID`+'
            '`PROCESSING`), počet nezaplacených převodů/faktur. Plus posledních 10 '
            'objednávek (číslo, zákazník, datum, total, status).'
        ),
        responses={200: AdminDashboardResponseSerializer},
    )
    def get(self, request):
        now = timezone.now()
        today = now.date()
        yesterday = today - timedelta(days=1)
        week_ago = now - timedelta(days=7)

        billable_orders = Order.objects.exclude(status__in=[OrderStatus.CANCELLED, OrderStatus.REFUNDED])

        orders_today_qs = Order.objects.filter(created_at__date=today)
        orders_yesterday_qs = Order.objects.filter(created_at__date=yesterday)

        revenue_today = billable_orders.filter(created_at__date=today).aggregate(total=Sum('total'))['total'] or 0
        revenue_yesterday = billable_orders.filter(created_at__date=yesterday).aggregate(total=Sum('total'))['total'] or 0

        recent_orders = (
            Order.objects.select_related('customer')
            .order_by('-created_at')[:10]
        )

        return Response({
            'orders_today': orders_today_qs.count(),
            'orders_yesterday': orders_yesterday_qs.count(),
            'revenue_today': revenue_today,
            'revenue_yesterday': revenue_yesterday,
            'new_customers_7d': Customer.objects.filter(created_at__gte=week_ago).count(),
            'pending_quotes': Order.objects.filter(status=OrderStatus.QUOTE_REQUESTED).count(),
            'orders_to_process': Order.objects.filter(status__in=_ORDERS_TO_PROCESS_STATUSES).count(),
            'unpaid_invoices': Order.objects.filter(
                payment_method__in=_UNPAID_PAYMENT_METHODS,
                payment_status=PaymentStatus.PENDING,
            ).exclude(status__in=[OrderStatus.CANCELLED, OrderStatus.REFUNDED]).count(),
            'recent_orders': [
                {
                    'id': order.id,
                    'order_number': order.order_number,
                    'customer_name': f'{order.customer.first_name} {order.customer.last_name}'.strip(),
                    'created_at': order.created_at,
                    'total': order.total,
                    'status': order.status,
                }
                for order in recent_orders
            ],
        })
