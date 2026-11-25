from django.db.models import Q

from .models import GarmentVariant


VARIANT_FIELDS = ('product_type_id', 'cut_id', 'color_id', 'size')


def offered_garments(motif=None):
    """The same source for configurators and checkout. No inventory implied."""
    variants = GarmentVariant.objects.filter(
        product_type__is_active=True, cut__is_active=True, color__is_active=True,
    )
    if motif is not None and motif.garment_exclusions:
        blocked = Q()
        for rule in motif.garment_exclusions:
            blocked |= Q(**rule)
        variants = variants.exclude(blocked)
    return variants
