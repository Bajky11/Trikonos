from io import BytesIO
from uuid import uuid4

from django.core.files.base import ContentFile
from django.db import transaction
from PIL import Image
from rest_framework import serializers

from .admin_motif_serializers import MOTIF_IMAGE_MAX_SIZE, UploadedImageField


class MockupUploadSerializer(serializers.Serializer):
    file = UploadedImageField()

    def validate_file(self, value):
        if value.size > MOTIF_IMAGE_MAX_SIZE:
            raise serializers.ValidationError('Obrázek může mít nejvýše 10 MB.')
        if value.image.format != 'PNG' or value.image.width * value.image.height > 16_000_000:
            raise serializers.ValidationError('Vyberte PNG s nejvýše 16 megapixely.')
        value.seek(0)
        try:
            with Image.open(value) as image:
                rgba = image.convert('RGBA')
        except (OSError, ValueError) as exc:
            raise serializers.ValidationError('PNG se nepodařilo přečíst.') from exc
        alpha = rgba.getchannel('A')
        if alpha.getextrema()[0] == 255 or not alpha.getbbox():
            raise serializers.ValidationError('PNG musí obsahovat obrázek s průhledným pozadím.')
        return rgba


def save_mockup(field, image, *, trim=False):
    if trim:
        image = image.crop(image.getchannel('A').getbbox())
    image.thumbnail((1600, 1600))
    buffer = BytesIO()
    image.save(buffer, format='PNG')
    field.save(f'{uuid4().hex}.png', ContentFile(buffer.getvalue()), save=False)


def delete_after_commit(field):
    if field:
        storage, name = field.storage, field.name
        transaction.on_commit(lambda: storage.delete(name), robust=True)
