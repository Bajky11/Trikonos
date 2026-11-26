from django.db import models


class ComgatePayment(models.Model):
    class State(models.TextChoices):
        UNKNOWN = 'UNKNOWN', 'Creation not confirmed'
        PENDING = 'PENDING', 'Pending'
        PAID = 'PAID', 'Test payment completed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    # The pilot deliberately allows only one gateway transaction per order.
    order = models.OneToOneField('Order', on_delete=models.PROTECT, related_name='comgate_payment')
    merchant = models.CharField(max_length=64)
    amount = models.PositiveIntegerField()
    transaction_id = models.CharField(max_length=128, unique=True, null=True)
    redirect_url = models.URLField(max_length=2048, blank=True)
    state = models.CharField(max_length=12, choices=State.choices, default=State.UNKNOWN)
    created_at = models.DateTimeField(auto_now_add=True)
