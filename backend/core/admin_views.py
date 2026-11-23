from datetime import timedelta

from django.db.models import Count, DateField, F, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from customers.models import Customer
from orders.models import Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus

from .admin_serializers import (
    AdminDashboardResponseSerializer,
    AdminRevenuePeriodSerializer,
    AdminSearchResponseSerializer,
    AdminTopMotifSerializer,
)


@method_decorator(never_cache, name='dispatch')
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


_BILLABLE_EXCLUDED_STATUSES = [OrderStatus.CANCELLED, OrderStatus.REFUNDED]
_TRUNC_BY_INTERVAL = {'DAY': TruncDate, 'WEEK': TruncWeek, 'MONTH': TruncMonth}


def _resolve_date_range(params):
    """Shared `createdFrom`/`createdTo` parsing for the two stats endpoints
    below - defaults to the last 30 days so a chart always has a sensible
    window instead of aggregating the whole order history by default.
    Silently falls back to the default on an unparseable date, same as the
    rest of the admin API doesn't hard-validate ad hoc query params.
    """
    today = timezone.now().date()
    created_from = parse_date(params.get('createdFrom', '') or '') or today - timedelta(days=30)
    created_to = parse_date(params.get('createdTo', '') or '') or today
    return created_from, created_to


class AdminRevenueStatsView(APIView):
    """GET /admin/stats/revenue - tržby v čase pro graf v administraci."""
    permission_classes = [IsAdmin]

    @extend_schema(
        tags=['Admin - přehled'],
        summary='Statistika: tržby v čase',
        description=(
            'Tržby (součet `total`, mimo CANCELLED/REFUNDED - stejné pravidlo '
            'jako na dashboardu) seskupené po dnech/týdnech/měsících za zvolené '
            'období - rozšíření dashboardu, který umí jen "dnes vs včera". '
            '`createdFrom`/`createdTo` (ISO datum) výchozí na posledních 30 dní, '
            '`interval` je `DAY` (výchozí), `WEEK` nebo `MONTH`. Vrací jen '
            'období, ve kterých aspoň jedna objednávka vznikla - žádné nulové '
            'výplně mezer, to si dořeší frontend podle potřeby grafu.'
        ),
        parameters=[
            OpenApiParameter('createdFrom', str, OpenApiParameter.QUERY),
            OpenApiParameter('createdTo', str, OpenApiParameter.QUERY),
            OpenApiParameter('interval', str, OpenApiParameter.QUERY, enum=['DAY', 'WEEK', 'MONTH']),
        ],
        responses={200: AdminRevenuePeriodSerializer(many=True)},
    )
    def get(self, request):
        created_from, created_to = _resolve_date_range(request.query_params)
        trunc = _TRUNC_BY_INTERVAL.get(request.query_params.get('interval', 'DAY').upper(), TruncDate)

        rows = (
            Order.objects.exclude(status__in=_BILLABLE_EXCLUDED_STATUSES)
            .filter(created_at__date__gte=created_from, created_at__date__lte=created_to)
            .annotate(period=trunc('created_at', output_field=DateField()))
            .values('period')
            .annotate(revenue=Sum('total'), orders_count=Count('id'))
            .order_by('period')
        )
        data = [
            {'period': row['period'], 'revenue': row['revenue'] or 0, 'orders_count': row['orders_count']}
            for row in rows
        ]
        return Response(AdminRevenuePeriodSerializer(data, many=True).data)


class AdminTopMotifsStatsView(APIView):
    """GET /admin/stats/top-motifs - žebříček nejprodávanějších motivů."""
    permission_classes = [IsAdmin]
    DEFAULT_LIMIT = 10
    MAX_LIMIT = 50

    @extend_schema(
        tags=['Admin - přehled'],
        summary='Statistika: nejprodávanější motivy',
        description=(
            'Žebříček motivů podle počtu prodaných kusů nebo tržby za zvolené '
            'období (objednávky mimo CANCELLED/REFUNDED, jen katalogové '
            'položky - vlastní potisk nemá `motif`). `createdFrom`/`createdTo` '
            '(ISO datum) výchozí na posledních 30 dní, `metric` je `QUANTITY` '
            '(výchozí) nebo `REVENUE`, `limit` výchozí 10, max 50.'
        ),
        parameters=[
            OpenApiParameter('createdFrom', str, OpenApiParameter.QUERY),
            OpenApiParameter('createdTo', str, OpenApiParameter.QUERY),
            OpenApiParameter('metric', str, OpenApiParameter.QUERY, enum=['QUANTITY', 'REVENUE']),
            OpenApiParameter('limit', int, OpenApiParameter.QUERY),
        ],
        responses={200: AdminTopMotifSerializer(many=True)},
    )
    def get(self, request):
        created_from, created_to = _resolve_date_range(request.query_params)
        metric = request.query_params.get('metric', 'QUANTITY').upper()
        try:
            limit = min(int(request.query_params.get('limit', self.DEFAULT_LIMIT)), self.MAX_LIMIT)
        except ValueError:
            limit = self.DEFAULT_LIMIT

        rows = (
            OrderItem.objects.filter(
                order__created_at__date__gte=created_from, order__created_at__date__lte=created_to,
                is_custom=False, motif__isnull=False,
            )
            .exclude(order__status__in=_BILLABLE_EXCLUDED_STATUSES)
            .values('motif_id', 'motif__name')
            # Aliases deliberately don't reuse the 'quantity' field name -
            # within a single .annotate() call that collides with F('quantity')
            # in the revenue_sum expression below and Django resolves it as
            # the just-created aggregate instead of the raw column, raising
            # "is an aggregate" (can't nest aggregates).
            .annotate(quantity_sum=Sum('quantity'), revenue_sum=Sum(F('quantity') * F('unit_price')))
            .order_by('-revenue_sum' if metric == 'REVENUE' else '-quantity_sum')[:limit]
        )
        data = [
            {
                'motif_id': row['motif_id'], 'motif_name': row['motif__name'],
                'quantity': row['quantity_sum'], 'revenue': row['revenue_sum'] or 0,
            }
            for row in rows
        ]
        return Response(AdminTopMotifSerializer(data, many=True).data)
