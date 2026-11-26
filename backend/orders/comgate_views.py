from django.conf import settings
from django.core import signing
from django.utils.crypto import constant_time_compare
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.tokens import resolve_order_access_token

from . import comgate
from .models import ComgatePayment, Order, PaymentMethod


class CardPaymentResponseSerializer(serializers.Serializer):
    state = serializers.ChoiceField(choices=['NOT_STARTED', *ComgatePayment.State.values])
    redirect_url = serializers.URLField(required=False)


def _card_order(token):
    if not comgate.enabled():
        raise NotFound()
    try:
        order_id = resolve_order_access_token(token)
    except signing.BadSignature:
        raise NotFound() from None
    order = Order.objects.filter(pk=order_id, payment_method=PaymentMethod.CARD_ONLINE).first()
    if order is None:
        raise NotFound()
    return order


def _result(order, payment):
    data = {'state': payment.state if payment else 'NOT_STARTED'}
    if (payment and comgate.payable(order) and payment.state == ComgatePayment.State.PENDING and payment.amount == order.total
            and payment.merchant == settings.COMGATE_MERCHANT and comgate.valid_redirect(payment.redirect_url)):
        data['redirect_url'] = payment.redirect_url
    return Response(data)


@method_decorator(never_cache, name='dispatch')
class CardPaymentView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'public-write'

    @extend_schema(tags=['Checkout'], summary='Ověřit stav testovací platby kartou', responses=CardPaymentResponseSerializer)
    def get(self, request, access_token):
        order = _card_order(access_token)
        payment = ComgatePayment.objects.filter(order=order).first()
        if payment:
            payment = comgate.verify(payment)
        return _result(order, payment)

    @extend_schema(tags=['Checkout'], summary='Založit testovací platbu kartou', request=None, responses=CardPaymentResponseSerializer)
    def post(self, request, access_token):
        order = _card_order(access_token)
        payment = comgate.start(order)
        order.refresh_from_db()
        return _result(order, payment)


class ComgatePushView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [FormParser]

    @extend_schema(exclude=True)
    def post(self, request):
        if not comgate.enabled():
            raise NotFound()
        fields = request.data
        if (not constant_time_compare(fields.get('secret', ''), settings.COMGATE_SECRET)
                or fields.get('merchant') != settings.COMGATE_MERCHANT or fields.get('test') != 'true'):
            raise PermissionDenied()
        transaction_id = fields.get('transId')
        if not transaction_id or len(transaction_id) > 128:
            raise NotFound()
        payment = ComgatePayment.objects.filter(transaction_id=transaction_id, merchant=settings.COMGATE_MERCHANT).first()
        if payment is None:
            raise NotFound()
        if comgate.verify(payment).state == ComgatePayment.State.PENDING:
            # Status can lag behind the notification; ask Comgate to retry.
            raise comgate.GatewayUnavailable()
        return Response(status=204)
