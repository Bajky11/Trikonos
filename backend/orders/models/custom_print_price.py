from django.db import models
from django.utils.translation import gettext_lazy as _


class CustomPrintPrice(models.Model):
    """Singleton: flat fee (haléře) added to product_type.price for every
    custom-print ("vlastní potisk") order item, set by admin through
    GET/PUT /admin/custom-print-price - same role motif.price plays for
    catalog items, just one shop-wide number instead of per-motif. Design
    placements (count, images vs. text) never affect the price - the shop
    deliberately charges one flat fee regardless.
    """
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    price = models.PositiveIntegerField(default=0, help_text='In haléře.')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'custom_print_price'
        verbose_name = _('custom print price')
        verbose_name_plural = _('custom print price')

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        obj, _created = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Cena vlastního potisku'
