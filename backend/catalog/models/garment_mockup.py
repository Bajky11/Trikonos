from django.db import models, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .cut import Cut
from .product_type import ProductType


class GarmentMockup(models.Model):
    product_type = models.ForeignKey(ProductType, on_delete=models.CASCADE)
    cut = models.ForeignKey(Cut, on_delete=models.CASCADE)
    image = models.ImageField(upload_to='garment-mockups', max_length=255)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['product_type', 'cut'], name='unique_garment_mockup')]


@receiver(post_delete, sender=GarmentMockup)
def delete_mockup_file(sender, instance, using, **kwargs):
    field = instance.image
    if field:
        transaction.on_commit(lambda: field.storage.delete(field.name), using=using, robust=True)
