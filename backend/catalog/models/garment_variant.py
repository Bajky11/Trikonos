from django.db import models

from core.models import UUIDModel

from .color import Color
from .cut import Cut
from .product_type import ProductType


class GarmentVariant(UUIDModel):
    """One offered blank garment configuration, independent of any motif."""

    product_type = models.ForeignKey(ProductType, on_delete=models.CASCADE)
    cut = models.ForeignKey(Cut, on_delete=models.CASCADE)
    color = models.ForeignKey(Color, on_delete=models.CASCADE)
    size = models.CharField(max_length=4)

    class Meta:
        db_table = 'garment_variants'
        constraints = [models.UniqueConstraint(
            fields=['product_type', 'cut', 'color', 'size'], name='unique_garment_variant',
        )]
