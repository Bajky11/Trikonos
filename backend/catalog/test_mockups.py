from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from .test_garment_offer import admin_api

pytestmark = pytest.mark.django_db


def png(transparent=True):
    image = Image.new('RGBA', (30, 30), (255, 255, 255, 0 if transparent else 255))
    image.paste((255, 255, 255, 255), (5, 5, 25, 25))
    buffer = BytesIO()
    image.save(buffer, format='PNG')
    return SimpleUploadedFile('input.png', buffer.getvalue(), content_type='image/png')


def test_design_upload_and_removal(admin_api, motif, settings, tmp_path, django_capture_on_commit_callbacks):
    settings.MEDIA_ROOT = tmp_path
    path = f'/api/v1/admin/motifs/{motif.pk}/design-image'
    assert APIClient().post(path, {'file': png()}, format='multipart').status_code in (401, 403)
    assert admin_api.post(path, {'file': png(False)}, format='multipart').status_code == 400
    assert admin_api.post(path, {'file': png()}, format='multipart').status_code == 204
    detail = APIClient().get(f'/api/v1/motifs/{motif.slug}').json()
    assert '/motif-designs/' in detail['designImageUrl']
    motif.refresh_from_db()
    old_file = motif.design_image.path
    with Image.open(old_file) as saved:
        assert saved.size == (20, 20)
    with django_capture_on_commit_callbacks(execute=True):
        assert admin_api.delete(path).status_code == 204
    assert not list(tmp_path.rglob('*.png'))


def test_garment_mockup_and_scoped_photo(admin_api, motif, product_type, cut, color, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    path = f'/api/v1/admin/garment-mockups/{product_type.pk}/{cut.pk}'
    assert APIClient().put(path, {'file': png()}, format='multipart').status_code in (401, 403)
    assert admin_api.put(path, {'file': png()}, format='multipart').status_code == 204
    public = APIClient()
    options = '/api/v1/catalog/options'
    mockup, = public.get(options).json()['garmentMockups']
    assert mockup['productTypeId'] == str(product_type.pk)
    assert mockup['cutId'] == str(cut.pk)
    assert '/garment-mockups/' in mockup['url']
    assert admin_api.delete(path).status_code == 204
    assert not public.get(options).json()['garmentMockups']

    photos = f'/api/v1/admin/motifs/{motif.pk}/images'
    assert admin_api.post(photos, {'file': png(), 'cutId': cut.pk}, format='multipart').status_code == 400
    response = admin_api.post(photos, {
        'file': png(), 'productTypeId': product_type.pk, 'cutId': cut.pk, 'colorId': color.pk,
    }, format='multipart')
    assert response.status_code == 201, response.json()
    photo, = public.get(f'/api/v1/motifs/{motif.slug}').json()['images']
    assert (photo['productTypeId'], photo['cutId'], photo['colorId']) == tuple(map(str, (product_type.pk, cut.pk, color.pk)))
