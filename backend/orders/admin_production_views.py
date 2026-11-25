from django.db import transaction
from django.db.models import Prefetch, Sum
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import CustomDesignPlacement, Order, OrderItem, OrderStatus
from .models.order_item import ItemProductionStatus

DEFAULT_PRODUCTION_STATUSES = [OrderStatus.PAID, OrderStatus.PROCESSING]

_STATUS_PARAM = OpenApiParameter('status', str, OpenApiParameter.QUERY, description='Čárkou oddělené stavy objednávky.')
_CREATED_FROM_PARAM = OpenApiParameter('createdFrom', str, OpenApiParameter.QUERY, description='ISO datum.')
_CREATED_TO_PARAM = OpenApiParameter('createdTo', str, OpenApiParameter.QUERY, description='ISO datum.')


class ProductionSummaryRowSerializer(serializers.Serializer):
    product_type = serializers.CharField()
    cut = serializers.CharField()
    color = serializers.CharField()
    size = serializers.CharField()
    quantity = serializers.IntegerField()


class ProductionPlacementRowSerializer(serializers.Serializer):
    order_number = serializers.CharField()
    item_label = serializers.CharField()
    print_area = serializers.CharField()
    width = serializers.IntegerField()
    height = serializers.IntegerField()
    rotation_deg = serializers.IntegerField()
    url = serializers.CharField()


class ProductionOrderPlacementSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    print_area = serializers.CharField(source='print_area.name')
    x = serializers.IntegerField()
    y = serializers.IntegerField()
    width = serializers.IntegerField()
    height = serializers.IntegerField()
    rotation_deg = serializers.IntegerField()
    url = serializers.CharField()


class ProductionOrderItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    item_label = serializers.CharField()
    is_custom = serializers.BooleanField()
    custom_text = serializers.CharField(allow_blank=True)
    motif = serializers.CharField(source='motif.name', allow_null=True)
    product_type = serializers.CharField(source='product_type.name')
    cut = serializers.CharField(source='cut.name')
    color = serializers.CharField(source='color.name')
    size = serializers.CharField()
    quantity = serializers.IntegerField()
    production_status = serializers.ChoiceField(choices=ItemProductionStatus.choices)
    production_revision = serializers.IntegerField()
    placements = ProductionOrderPlacementSerializer(source='design_placements', many=True)


class ProductionOrderSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    order_number = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
    production_status = serializers.SerializerMethodField()
    items = ProductionOrderItemSerializer(many=True)

    def get_production_status(self, order):
        items = list(order.items.all())
        if not order.production_started:
            return 'NOT_STARTED'
        if items and all(item.production_status == ItemProductionStatus.DONE for item in items):
            return 'DONE'
        return 'IN_PROGRESS'


class ProductionItemUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ItemProductionStatus.choices)
    expected_status = serializers.ChoiceField(choices=ItemProductionStatus.choices)
    expected_revision = serializers.IntegerField(min_value=0)


@method_decorator(never_cache, name='dispatch')
class ProductionStartView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(tags=['Admin - výroba'], summary='Zahájit interní výrobu objednávky', request=None, responses={204: None})
    @transaction.atomic
    def post(self, request, order_id):
        order = get_object_or_404(Order.objects.select_for_update(), pk=order_id)
        if order.status in (OrderStatus.CANCELLED, OrderStatus.REFUNDED):
            return Response({'detail': 'Zrušenou nebo vrácenou objednávku nelze předat do výroby.'}, status=status.HTTP_409_CONFLICT)
        if not order.production_started:
            order.production_started = True
            order.save(update_fields=['production_started'])
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(never_cache, name='dispatch')
class ProductionItemStatusView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(tags=['Admin - výroba'], summary='Změnit interní stav výroby položky', request=ProductionItemUpdateSerializer, responses={204: None})
    @transaction.atomic
    def patch(self, request, order_id, item_id):
        serializer = ProductionItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = get_object_or_404(Order.objects.select_for_update(), pk=order_id)
        item = get_object_or_404(OrderItem, pk=item_id, order=order)
        if not order.production_started or order.status in (OrderStatus.CANCELLED, OrderStatus.REFUNDED):
            return Response({'detail': 'Výroba objednávky není zahájena nebo je objednávka zrušená.'}, status=status.HTTP_409_CONFLICT)
        if (item.production_status != serializer.validated_data['expected_status'] or
                item.production_revision != serializer.validated_data['expected_revision']):
            return Response({'detail': 'Stav položky se mezitím změnil. Načtěte aktuální stav.'}, status=status.HTTP_409_CONFLICT)
        item.production_status = serializer.validated_data['status']
        item.production_revision += 1
        item.save(update_fields=['production_status', 'production_revision'])
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(never_cache, name='dispatch')
class ProductionOrdersView(APIView):
    """Objednávky a jejich kompletní položky pro výrobní přehled."""
    permission_classes = [IsAdmin]

    @extend_schema(
        tags=['Admin - výroba'], summary='Objednávky pro výrobu',
        parameters=[_STATUS_PARAM, _CREATED_FROM_PARAM, _CREATED_TO_PARAM],
        responses={200: ProductionOrderSerializer(many=True)},
    )
    def get(self, request):
        params = request.query_params
        statuses = [value.strip() for value in params['status'].split(',')] if params.get('status') else DEFAULT_PRODUCTION_STATUSES
        orders = Order.objects.filter(status__in=statuses)
        if params.get('createdFrom'):
            orders = orders.filter(created_at__date__gte=params['createdFrom'])
        if params.get('createdTo'):
            orders = orders.filter(created_at__date__lte=params['createdTo'])
        items = OrderItem.objects.select_related('motif', 'product_type', 'cut', 'color').prefetch_related(
            Prefetch('design_placements', queryset=CustomDesignPlacement.objects.select_related('print_area').order_by('created_at', 'id')),
        ).order_by('id')
        orders = orders.prefetch_related(Prefetch('items', queryset=items)).order_by('created_at', 'id')
        return Response(ProductionOrderSerializer(orders, many=True).data)


@method_decorator(never_cache, name='dispatch')
class ProductionSummaryView(APIView):
    """Kolik kusů od každé kombinace typ/střih/barva/velikost vyrobit."""
    permission_classes = [IsAdmin]

    @extend_schema(
        tags=['Admin - výroba'],
        summary='Souhrn kusů k výrobě podle typu/střihu/barvy/velikosti',
        description=(
            'Součet `quantity` ze všech položek objednávek seskupený podle '
            '`productType`/`cut`/`color`/`size` - slouží jako nákupní seznam '
            'prázdných triček/mikin před tiskem. Filtr `status` (výchozí '
            '`PAID,PROCESSING` - objednávky, které se už opravdu budou '
            'vyrábět), `createdFrom`/`createdTo` pro omezení na konkrétní '
            'období. Zahrnuje jak katalogové, tak vlastní položky - pro '
            'samotné podklady k vlastnímu potisku použij '
            '`/production/placements`.'
        ),
        parameters=[_STATUS_PARAM, _CREATED_FROM_PARAM, _CREATED_TO_PARAM],
        responses={200: ProductionSummaryRowSerializer(many=True)},
    )
    def get(self, request):
        params = request.query_params
        status_param = params.get('status')
        statuses = [value.strip() for value in status_param.split(',')] if status_param else DEFAULT_PRODUCTION_STATUSES

        queryset = OrderItem.objects.filter(order__status__in=statuses)

        created_from = params.get('createdFrom')
        if created_from:
            queryset = queryset.filter(order__created_at__date__gte=created_from)
        created_to = params.get('createdTo')
        if created_to:
            queryset = queryset.filter(order__created_at__date__lte=created_to)

        rows = (
            queryset.values('product_type__name', 'cut__name', 'color__name', 'size')
            .annotate(total_quantity=Sum('quantity'))
            .order_by('product_type__name', 'cut__name', 'color__name', 'size')
        )

        return Response([
            {
                'product_type': row['product_type__name'],
                'cut': row['cut__name'],
                'color': row['color__name'],
                'size': row['size'],
                'quantity': row['total_quantity'],
            }
            for row in rows
        ])


@method_decorator(never_cache, name='dispatch')
class ProductionPlacementsView(APIView):
    """Seznam umístění vlastního potisku připravených k tisku."""
    permission_classes = [IsAdmin]

    @extend_schema(
        tags=['Admin - výroba'],
        summary='Podklady k tisku vlastních potisků',
        description=(
            'Plochý seznam všech umístění vlastního potisku (napříč '
            'objednávkami) - číslo objednávky, popisek položky, název '
            'tiskového bloku, rozměry, rotace a `url` na soubor ke stažení. '
            'Filtry stejné jako u `/production/summary`, navíc `printArea` '
            '(id tiskového bloku, pro zobrazení "všechny potisky na záda '
            'tento týden" apod.).'
        ),
        parameters=[
            _STATUS_PARAM, _CREATED_FROM_PARAM, _CREATED_TO_PARAM,
            OpenApiParameter('printArea', str, OpenApiParameter.QUERY, description='UUID tiskového bloku.'),
        ],
        responses={200: ProductionPlacementRowSerializer(many=True)},
    )
    def get(self, request):
        params = request.query_params
        queryset = CustomDesignPlacement.objects.select_related(
            'print_area', 'order_item', 'order_item__order',
        )

        status_param = params.get('status')
        if status_param:
            statuses = [value.strip() for value in status_param.split(',')]
            queryset = queryset.filter(order_item__order__status__in=statuses)

        print_area_id = params.get('printArea')
        if print_area_id:
            queryset = queryset.filter(print_area_id=print_area_id)

        created_from = params.get('createdFrom')
        if created_from:
            queryset = queryset.filter(order_item__order__created_at__date__gte=created_from)
        created_to = params.get('createdTo')
        if created_to:
            queryset = queryset.filter(order_item__order__created_at__date__lte=created_to)

        return Response([
            {
                'order_number': placement.order_item.order.order_number,
                'item_label': placement.order_item.item_label,
                'print_area': placement.print_area.name,
                'width': placement.width,
                'height': placement.height,
                'rotation_deg': placement.rotation_deg,
                'url': placement.url,
            }
            for placement in queryset.order_by('order_item__order__created_at')
        ])
