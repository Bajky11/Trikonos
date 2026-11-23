from datetime import timedelta
from io import BytesIO

import pytest
from PIL import Image
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from customers.models import Customer
from orders.models import Order, OrderStatus
from orders.services import build_order_item

from .views import MotifViewSet
from .models import Category, Color, Motif, MotifVariant, PrintArea, ProductType

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(email='admin@trikonos.cz', password='x', name='Admin')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _fake_jpeg():
    buffer = BytesIO()
    Image.new('RGB', (800, 600), color='red').save(buffer, format='JPEG')
    buffer.seek(0)
    return SimpleUploadedFile('photo.jpg', buffer.read(), content_type='image/jpeg')


def test_upload_image_creates_thumbnails_and_becomes_the_main_image(admin_client, motif, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path

    response = admin_client.post(
        f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart',
    )

    assert response.status_code == 201
    images = response.data['images']
    assert len(images) == 1
    image = images[0]
    assert image['url']
    assert image['thumbnail_small_url']
    assert image['thumbnail_large_url']
    public_image = response.json()['images'][0]
    assert public_image['id'] == image['id']
    assert public_image['thumbnailSmallUrl'] == image['thumbnail_small_url']
    assert public_image['colorId'] is None

    motif.refresh_from_db()
    stored = motif.images[0]
    assert default_storage.exists(stored['path'])
    assert default_storage.exists(stored['thumbnail_small_path'])
    assert default_storage.exists(stored['thumbnail_large_path'])


def test_unauthenticated_cannot_upload_image(motif, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path

    response = APIClient().post(
        f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart',
    )

    assert response.status_code in (401, 403)


def test_upload_rejects_file_over_size_limit(admin_client, motif, monkeypatch, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    monkeypatch.setattr('catalog.admin_motif_serializers.MOTIF_IMAGE_MAX_SIZE', 10)

    response = admin_client.post(
        f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart',
    )

    assert response.status_code == 413
    assert response.data['error']['code'] == 'FILE_TOO_LARGE'


def test_upload_rejects_non_image_file(admin_client, motif, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    fake_file = SimpleUploadedFile('not-a-photo.jpg', b'this is not an image', content_type='image/jpeg')

    response = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': fake_file}, format='multipart')

    assert response.status_code == 400


def test_reorder_images_changes_the_main_image(admin_client, motif, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    first = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')
    second = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')
    first_id = first.data['images'][0]['id']
    second_id = second.data['images'][1]['id']

    response = admin_client.post(
        f'/api/v1/admin/motifs/{motif.id}/images/reorder', {'ids': [second_id, first_id]}, format='json',
    )

    assert response.status_code == 200
    assert [image['id'] for image in response.data['images']] == [second_id, first_id]
    duplicate = admin_client.post(
        f'/api/v1/admin/motifs/{motif.id}/images/reorder', {'ids': [first_id, first_id]}, format='json',
    )
    assert duplicate.status_code == 400
    motif.refresh_from_db()
    assert [image['id'] for image in motif.images] == [second_id, first_id]


def test_delete_image_removes_files_from_storage(admin_client, motif, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    upload = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')
    motif.refresh_from_db()
    stored = motif.images[0]
    image_id = upload.data['images'][0]['id']

    response = admin_client.delete(f'/api/v1/admin/motifs/{motif.id}/images/{image_id}')

    assert response.status_code == 204
    motif.refresh_from_db()
    assert motif.images == []
    assert not default_storage.exists(stored['path'])
    assert not default_storage.exists(stored['thumbnail_small_path'])
    assert not default_storage.exists(stored['thumbnail_large_path'])


def test_delete_unknown_image_returns_404(admin_client, motif):
    response = admin_client.delete(f'/api/v1/admin/motifs/{motif.id}/images/00000000-0000-0000-0000-000000000000')
    assert response.status_code == 404


def test_update_image_alt_text(admin_client, motif, color, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    upload = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')
    image_id = upload.data['images'][0]['id']

    response = admin_client.patch(
        f'/api/v1/admin/motifs/{motif.id}/images/{image_id}', {'altText': 'Bitcoin tričko', 'colorId': str(color.id)}, format='json',
    )

    assert response.status_code == 200
    assert response.data['images'][0]['alt_text'] == 'Bitcoin tričko'
    assert response.json()['images'][0]['colorId'] == str(color.id)
    cleared = admin_client.patch(
        f'/api/v1/admin/motifs/{motif.id}/images/{image_id}', {'colorId': None}, format='json',
    )
    assert cleared.status_code == 200
    assert cleared.json()['images'][0]['colorId'] is None


def test_update_image_color_id(admin_client, motif, color, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    upload = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')
    image_id = upload.data['images'][0]['id']

    response = admin_client.patch(
        f'/api/v1/admin/motifs/{motif.id}/images/{image_id}', {'colorId': str(color.id)}, format='json',
    )

    assert response.status_code == 200
    assert response.data['images'][0]['color_id'] == str(color.id)


def test_update_unknown_image_returns_404(admin_client, motif):
    response = admin_client.patch(
        f'/api/v1/admin/motifs/{motif.id}/images/00000000-0000-0000-0000-000000000000', {'altText': 'x'}, format='json',
    )
    assert response.status_code == 404


def test_upload_rejects_gif_file(admin_client, motif, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    buffer = BytesIO()
    Image.new('RGB', (10, 10), color='blue').save(buffer, format='GIF')
    buffer.seek(0)
    gif = SimpleUploadedFile('photo.gif', buffer.read(), content_type='image/gif')

    response = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': gif}, format='multipart')

    assert response.status_code == 400
    assert 'file' in response.data['error']['fields']


def test_reorder_images_rejects_unknown_id(admin_client, motif, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')

    response = admin_client.post(
        f'/api/v1/admin/motifs/{motif.id}/images/reorder',
        {'ids': ['00000000-0000-0000-0000-000000000000']}, format='json',
    )

    assert response.status_code == 400


def test_reorder_images_partial_list_appends_remainder_in_original_order(admin_client, motif, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    first = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')
    second = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')
    third = admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')
    first_id = first.data['images'][0]['id']
    second_id = second.data['images'][1]['id']
    third_id = third.data['images'][2]['id']

    # Only reorders the first two - the third isn't mentioned, so it must
    # keep its place at the tail rather than disappearing.
    response = admin_client.post(
        f'/api/v1/admin/motifs/{motif.id}/images/reorder', {'ids': [second_id, first_id]}, format='json',
    )

    assert response.status_code == 200
    assert [image['id'] for image in response.data['images']] == [second_id, first_id, third_id]


def test_deleting_a_motif_used_in_an_order_returns_409(motif, product_type, cut, color, admin_client):
    customer = Customer.objects.create(email='jana@example.cz', first_name='Jana', last_name='Nováková')
    order = Order.objects.create(
        order_number='TRK-2026-9001', customer=customer, status=OrderStatus.NEW,
        billing_full_name='Jana Nováková', billing_street='Horní 12', billing_city='Vrchlabí', billing_zip='54301',
        shipping_full_name='Jana Nováková', shipping_street='Horní 12', shipping_city='Vrchlabí', shipping_zip='54301',
    )
    build_order_item(order, {
        'is_custom': False, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1, 'placements': [],
    })

    response = admin_client.delete(f'/api/v1/admin/motifs/{motif.id}')

    assert response.status_code == 409
    assert response.data['error']['code'] == 'IN_USE'
    assert Motif.objects.filter(pk=motif.id).exists()


def test_deleting_an_unused_motif_succeeds(motif, admin_client):
    response = admin_client.delete(f'/api/v1/admin/motifs/{motif.id}')

    assert response.status_code == 204
    assert not Motif.objects.filter(pk=motif.id).exists()


def test_deleting_a_motif_with_images_removes_their_files_from_storage(admin_client, motif, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    admin_client.post(f'/api/v1/admin/motifs/{motif.id}/images', {'file': _fake_jpeg()}, format='multipart')
    motif.refresh_from_db()
    stored = motif.images[0]

    response = admin_client.delete(f'/api/v1/admin/motifs/{motif.id}')

    assert response.status_code == 204
    assert not default_storage.exists(stored['path'])
    assert not default_storage.exists(stored['thumbnail_small_path'])
    assert not default_storage.exists(stored['thumbnail_large_path'])


# ---------------------------------------------------------------------------
# Admin motif create/update/reorder
# ---------------------------------------------------------------------------

def test_admin_motif_list_filters_by_category_isactive_and_q(admin_client, category):
    matching = Motif.objects.create(name='Hledaný', slug='hledany', price=10000, category=category)
    Motif.objects.create(name='Neaktivní', slug='admin-neaktivni', price=10000, category=category, is_active=False)
    other_category = Category.objects.create(name='Jiná kategorie', slug='jina-kategorie-2')
    Motif.objects.create(name='Jinde', slug='admin-jinde', price=10000, category=other_category)

    by_category = admin_client.get('/api/v1/admin/motifs', {'category': str(category.id)})
    assert str(matching.id) in [row['id'] for row in by_category.data['results']]
    assert all(row['category']['id'] == str(category.id) for row in by_category.data['results'])

    by_active = admin_client.get('/api/v1/admin/motifs', {'isActive': 'false'})
    assert any(row['name'] == 'Neaktivní' for row in by_active.data['results'])
    assert all(row['is_active'] is False for row in by_active.data['results'])

    by_search = admin_client.get('/api/v1/admin/motifs', {'q': 'Hledaný'})
    assert [row['id'] for row in by_search.data['results']] == [str(matching.id)]


def test_admin_can_retrieve_motif_detail(admin_client, motif):
    response = admin_client.get(f'/api/v1/admin/motifs/{motif.id}')

    assert response.status_code == 200
    assert response.data['slug'] == motif.slug


def test_admin_can_create_motif_with_auto_generated_slug(admin_client, category):
    response = admin_client.post(
        '/api/v1/admin/motifs', {'name': 'Horský vrchol', 'category': str(category.id), 'price': 59900}, format='json',
    )

    assert response.status_code == 201
    assert response.data['slug'] == 'horsky-vrchol'
    assert response.data['images'] == []


def test_create_motif_with_duplicate_slug_returns_400(admin_client, category, motif):
    response = admin_client.post(
        '/api/v1/admin/motifs',
        {'name': 'Jiný název', 'slug': motif.slug, 'category': str(category.id), 'price': 10000},
        format='json',
    )

    assert response.status_code == 400
    assert 'slug' in response.data['error']['fields']


def test_update_motif_with_auto_generated_colliding_slug_returns_400(admin_client, category, motif):
    # Same reasoning as the category test: a client-supplied duplicate slug
    # (or name) is already caught by the model fields' own unique=True
    # before validate() runs - this targets the one case that can't:
    # renaming (no explicit slug, different exact name string) to something
    # whose auto-generated slug still collides with a different motif.
    other = Motif.objects.create(name='Les a hory', slug='les-a-hory', price=50000, category=category)

    response = admin_client.patch(f'/api/v1/admin/motifs/{other.id}', {'name': f'{motif.name},'}, format='json')

    assert response.status_code == 400
    assert 'slug' in response.data['error']['fields']


def test_admin_can_update_motif_price(admin_client, motif):
    response = admin_client.patch(f'/api/v1/admin/motifs/{motif.id}', {'price': 123400}, format='json')

    assert response.status_code == 200
    motif.refresh_from_db()
    assert motif.price == 123400


def test_admin_can_reorder_motifs(admin_client, category):
    first = Motif.objects.create(name='Druhý v pořadí', slug='druhy-v-poradi', price=10000, category=category)
    second = Motif.objects.create(name='První v pořadí', slug='prvni-v-poradi', price=10000, category=category)

    response = admin_client.post('/api/v1/admin/motifs/reorder', {'ids': [str(second.id), str(first.id)]}, format='json')

    assert response.status_code == 204
    second.refresh_from_db()
    first.refresh_from_db()
    assert second.position < first.position


def test_reorder_motifs_rejects_unknown_id(admin_client, motif):
    response = admin_client.post(
        '/api/v1/admin/motifs/reorder', {'ids': ['00000000-0000-0000-0000-000000000000']}, format='json',
    )

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Public endpoints - ordering=popular (90-day window) and related() filler
# ---------------------------------------------------------------------------

def _sell(motif, product_type, cut, color, *, quantity, created_at=None):
    MotifVariant.objects.get_or_create(motif=motif, product_type=product_type, cut=cut, color=color, size='M')
    customer = Customer.objects.create(email=f'{motif.slug}-{quantity}@example.cz')
    order = Order.objects.create(
        order_number=f'TRK-2026-{motif.slug}-{quantity}', customer=customer, status=OrderStatus.NEW,
        billing_full_name='Jana', billing_street='Horní 12', billing_city='Vrchlabí', billing_zip='54301',
        shipping_full_name='Jana', shipping_street='Horní 12', shipping_city='Vrchlabí', shipping_zip='54301',
    )
    build_order_item(order, {
        'is_custom': False, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': quantity, 'placements': [],
    })
    if created_at is not None:
        Order.objects.filter(pk=order.pk).update(created_at=created_at)
    return order


def test_motifs_ordering_popular_ranks_by_recent_units_sold(category, product_type, cut, color):
    big_seller = Motif.objects.create(name='Hory', slug='hory', price=50000, category=category)
    small_seller = Motif.objects.create(name='Les', slug='les', price=50000, category=category)
    _sell(big_seller, product_type, cut, color, quantity=10)
    _sell(small_seller, product_type, cut, color, quantity=1)

    response = APIClient().get('/api/v1/motifs', {'ordering': 'popular'})

    slugs = [item['slug'] for item in response.data['results']]
    assert slugs.index('hory') < slugs.index('les')


def test_motifs_ordering_popular_ignores_sales_older_than_90_days(category, product_type, cut, color):
    recently_popular = Motif.objects.create(name='Hory', slug='hory', price=50000, category=category)
    once_popular = Motif.objects.create(name='Les', slug='les', price=50000, category=category)
    _sell(recently_popular, product_type, cut, color, quantity=5)
    _sell(once_popular, product_type, cut, color, quantity=50, created_at=timezone.now() - timedelta(days=91))

    response = APIClient().get('/api/v1/motifs', {'ordering': 'popular'})

    slugs = [item['slug'] for item in response.data['results']]
    assert slugs.index('hory') < slugs.index('les')


def test_categories_list_is_active_only_ordered_by_position(category):
    Category.objects.create(name='Neaktivní', slug='neaktivni', is_active=False)
    other = Category.objects.create(name='Dámská', slug='damska', position=5)
    category.position = 1
    category.save(update_fields=['position'])

    response = APIClient().get('/api/v1/categories')

    slugs = [item['slug'] for item in response.data]
    assert slugs == [category.slug, other.slug]


def test_category_detail_by_slug(category):
    response = APIClient().get(f'/api/v1/categories/{category.slug}')

    assert response.status_code == 200
    assert response.data['slug'] == category.slug


def test_inactive_category_detail_returns_404(category):
    category.is_active = False
    category.save(update_fields=['is_active'])

    response = APIClient().get(f'/api/v1/categories/{category.slug}')

    assert response.status_code == 404


def test_motifs_filtered_by_category(category):
    matching = Motif.objects.create(name='V kategorii', slug='v-kategorii', price=10000, category=category)
    other_category = Category.objects.create(name='Jiná', slug='jina')
    Motif.objects.create(name='Jinde', slug='jinde', price=10000, category=other_category)

    response = APIClient().get('/api/v1/motifs', {'category': category.slug})

    assert [item['slug'] for item in response.data['results']] == [matching.slug]


def test_motifs_filtered_by_fulltext_search(category):
    matching = Motif.objects.create(name='Bitcoin raketa', slug='bitcoin-raketa', price=10000, category=category)
    Motif.objects.create(name='Jiný motiv', slug='jiny-motiv-2', price=10000, category=category)

    response = APIClient().get('/api/v1/motifs', {'q': 'raketa'})

    assert [item['slug'] for item in response.data['results']] == [matching.slug]


def test_motifs_filtered_by_ids(category):
    first = Motif.objects.create(name='První', slug='prvni', price=10000, category=category)
    Motif.objects.create(name='Druhý', slug='druhy', price=10000, category=category)

    response = APIClient().get('/api/v1/motifs', {'ids': str(first.id)})

    assert [item['slug'] for item in response.data['results']] == [first.slug]


def test_motifs_ordering_created_at_price_and_name(category):
    old_cheap = Motif.objects.create(name='Zebra', slug='zebra', price=10000, category=category)
    new_expensive = Motif.objects.create(name='Alfa', slug='alfa', price=90000, category=category)

    by_created = APIClient().get('/api/v1/motifs', {'ordering': '-createdAt'}).data['results']
    assert [item['slug'] for item in by_created] == [new_expensive.slug, old_cheap.slug]

    by_price = APIClient().get('/api/v1/motifs', {'ordering': 'price'}).data['results']
    assert [item['slug'] for item in by_price] == [old_cheap.slug, new_expensive.slug]

    by_price_desc = APIClient().get('/api/v1/motifs', {'ordering': '-price'}).data['results']
    assert [item['slug'] for item in by_price_desc] == [new_expensive.slug, old_cheap.slug]

    by_name = APIClient().get('/api/v1/motifs', {'ordering': 'name'}).data['results']
    assert [item['slug'] for item in by_name] == [new_expensive.slug, old_cheap.slug]  # Alfa < Zebra


def test_related_motifs_prefers_same_category(motif, category):
    # Below RELATED_MOTIFS_LIMIT (8), so the other-category motif still
    # shows up too - just as filler, after the same-category one.
    same_category = Motif.objects.create(name='Jiný motiv', slug='jiny-motiv', price=50000, category=category)
    other_category = Category.objects.create(name='Dámská', slug='damska')
    filler = Motif.objects.create(name='Mimo kategorii', slug='mimo-kategorii', price=50000, category=other_category)

    response = APIClient().get(f'/api/v1/motifs/{motif.slug}/related')

    slugs = [item['slug'] for item in response.data]
    assert slugs == [same_category.slug, filler.slug]


def test_related_motifs_fills_up_to_limit_from_other_categories(motif, category):
    other_category = Category.objects.create(name='Dámská', slug='damska')
    fillers = [
        Motif.objects.create(name=f'Filler {i}', slug=f'filler-{i}', price=50000, category=other_category)
        for i in range(8)
    ]

    response = APIClient().get(f'/api/v1/motifs/{motif.slug}/related')

    assert len(response.data) == 8
    returned_slugs = {item['slug'] for item in response.data}
    assert returned_slugs == {f.slug for f in fillers}


def test_related_motifs_excludes_inactive_motifs(motif, category):
    Motif.objects.create(name='Neaktivní', slug='neaktivni', price=50000, category=category, is_active=False)

    response = APIClient().get(f'/api/v1/motifs/{motif.slug}/related')

    assert response.data == []


def test_paginated_ordering_breaks_price_and_date_ties_with_a_unique_key():
    for ordering, field in [('price', 'price'), ('-price', '-price'), ('-createdAt', '-created_at')]:
        queryset = MotifViewSet._ordered(Motif.objects.all(), ordering)
        assert queryset.query.order_by == (field, 'id')


def test_admin_motif_writes_return_the_detail_shape(admin_client, category):
    created = admin_client.post('/api/v1/admin/motifs', {
        'name': 'Nový motiv', 'slug': 'stabilni-url', 'price': 49990,
        'category': str(category.id), 'isActive': False,
    }, format='json')
    assert created.status_code == 201
    data = created.json()
    assert data['ordersCount'] == 0
    assert data['category'] == {'id': str(category.id), 'name': category.name}
    updated = admin_client.patch(f"/api/v1/admin/motifs/{data['id']}", {
        'slug': data['slug'], 'price': 59990, 'isActive': True,
    }, format='json')
    assert updated.status_code == 200
    assert updated.json()['slug'] == 'stabilni-url'
    assert updated.json()['price'] == 59990
    assert updated.json()['category'] == data['category']
    invalid = admin_client.post('/api/v1/admin/motifs', {
        'name': '!!!', 'price': 49990, 'category': str(category.id),
    }, format='json')
    assert invalid.status_code == 400
    assert 'slug' in invalid.json()['error']['fields']


def test_admin_lookup_contract_validates_prices_dimensions_and_category_urls(admin_client, product_type, category):
    updated = admin_client.patch(f'/api/v1/admin/product-types/{product_type.id}', {'price': 12345}, format='json')
    assert updated.status_code == 200
    assert updated.json()['price'] == 12345
    created = admin_client.post('/api/v1/admin/print-areas', {
        'name': 'Test přední plochy', 'productType': str(product_type.id), 'widthMm': 250, 'heightMm': 300,
    }, format='json')
    assert created.status_code == 201
    assert created.json()['productType'] == str(product_type.id)
    area_id = created.json()['id']
    invalid = admin_client.patch(f'/api/v1/admin/print-areas/{area_id}', {'widthMm': 0}, format='json')
    assert invalid.status_code == 400
    assert 'widthMm' in invalid.json()['error']['fields']
    original_slug = category.slug
    renamed = admin_client.patch(f'/api/v1/admin/categories/{category.id}', {
        'name': 'Nový název kategorie', 'slug': original_slug, 'isActive': False,
    }, format='json')
    assert renamed.status_code == 200
    assert renamed.json()['slug'] == original_slug
    invalid_slug = admin_client.post('/api/v1/admin/categories', {'name': '!!!'}, format='json')
    assert invalid_slug.status_code == 400
    assert 'slug' in invalid_slug.json()['error']['fields']


def test_inactive_motif_returns_404_on_public_detail(motif):
    motif.is_active = False
    motif.save(update_fields=['is_active'])

    response = APIClient().get(f'/api/v1/motifs/{motif.slug}')

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# /catalog/options - public lookups must never leak inactive records
# ---------------------------------------------------------------------------

def test_catalog_options_excludes_inactive_cut_color_and_product_type(product_type, cut, color):
    cut.is_active = False
    cut.save(update_fields=['is_active'])
    color.is_active = False
    color.save(update_fields=['is_active'])
    product_type.is_active = False
    product_type.save(update_fields=['is_active'])

    response = APIClient().get('/api/v1/catalog/options')

    assert response.data['cuts'] == []
    assert response.data['colors'] == []
    assert response.data['product_types'] == []


def test_catalog_options_excludes_inactive_print_area_of_an_active_product_type(product_type, print_area):
    print_area.is_active = False
    print_area.save(update_fields=['is_active'])

    response = APIClient().get('/api/v1/catalog/options')

    product_type_data = next(pt for pt in response.data['product_types'] if pt['id'] == product_type.id)
    assert product_type_data['print_areas'] == []


# ---------------------------------------------------------------------------
# Generic lookup tables (categories/colors/cuts/product types/print areas)
# share one deletion-protection path (core.admin_lookup.LookupAdminViewSet) -
# exercised here through a category, since motif's own (different) delete
# view already covers the motif-specific IN_USE case above.
# ---------------------------------------------------------------------------

def test_deleting_a_category_used_by_a_motif_returns_409(motif, category, admin_client):
    response = admin_client.delete(f'/api/v1/admin/categories/{category.id}')

    assert response.status_code == 409
    assert response.data['error']['code'] == 'IN_USE'
    assert Category.objects.filter(id=category.id).exists()


def test_lookup_isactive_and_q_filters(admin_client, category):
    inactive = Category.objects.create(name='Skrytá', slug='skryta', is_active=False)

    only_inactive = admin_client.get('/api/v1/admin/categories', {'isActive': 'false'})
    assert [row['id'] for row in only_inactive.data['results']] == [str(inactive.id)]

    by_search = admin_client.get('/api/v1/admin/categories', {'q': category.name})
    assert [row['id'] for row in by_search.data['results']] == [str(category.id)]


def test_lookup_reorder_rejects_unknown_id(admin_client, category):
    response = admin_client.post(
        '/api/v1/admin/categories/reorder', {'ids': ['00000000-0000-0000-0000-000000000000']}, format='json',
    )

    assert response.status_code == 400


def test_print_areas_filtered_by_product_type(admin_client, product_type):
    other_type = ProductType.objects.create(name='Mikina')
    matching = PrintArea.objects.create(product_type=product_type, name='Přední', width_mm=100, height_mm=100)
    PrintArea.objects.create(product_type=other_type, name='Záda', width_mm=100, height_mm=100)

    response = admin_client.get('/api/v1/admin/print-areas', {'productType': str(product_type.id)})

    assert [row['id'] for row in response.data['results']] == [str(matching.id)]


def test_create_category_auto_generates_slug(admin_client):
    response = admin_client.post('/api/v1/admin/categories', {'name': 'Dětská trička'}, format='json')

    assert response.status_code == 201
    assert response.data['slug'] == 'detska-tricka'


def test_create_category_with_duplicate_slug_returns_400(admin_client, category):
    response = admin_client.post('/api/v1/admin/categories', {'name': 'Jiný název', 'slug': category.slug}, format='json')

    assert response.status_code == 400


def test_update_category_with_auto_generated_colliding_slug_returns_400(admin_client):
    # A client-supplied duplicate slug (or name) is already caught by the
    # model fields' own unique=True (DRF's auto UniqueValidator) before this
    # serializer's custom validate() even runs. This targets the one case
    # the model-level validators *can't* catch: renaming a category (no
    # explicit slug in the PATCH, and a `name` that's a different exact
    # string) to something whose auto-generated slug still collides with a
    # different category - validate() must regenerate the slug itself and
    # re-check it, since neither unique=True field was handed a literal
    # duplicate value.
    Category.objects.create(name='Summer Sale', slug='summer-sale')
    other = Category.objects.create(name='Winter Sale', slug='winter-sale')

    response = admin_client.patch(f'/api/v1/admin/categories/{other.id}', {'name': 'Summer, Sale'}, format='json')

    assert response.status_code == 400
    assert 'slug' in response.data['error']['fields']


def test_create_color_with_invalid_hex_returns_400(admin_client):
    # '#GGGGGG' is within the model's max_length=7 (so DRF's own length
    # check doesn't short-circuit first) but fails the #RRGGBB regex.
    response = admin_client.post('/api/v1/admin/colors', {'name': 'Zelená', 'hexValue': '#GGGGGG'}, format='json')

    assert response.status_code == 400
    assert 'hex_value' in response.data['error']['fields']


def test_create_color_normalizes_hex_to_uppercase(admin_client):
    response = admin_client.post('/api/v1/admin/colors', {'name': 'Zelená', 'hexValue': '#00ff00'}, format='json')

    assert response.status_code == 201
    assert response.data['hex_value'] == '#00FF00'


def test_create_print_area_with_non_positive_width_returns_400(admin_client, product_type):
    response = admin_client.post(
        '/api/v1/admin/print-areas',
        {'name': 'Přední', 'productType': str(product_type.id), 'widthMm': 0, 'heightMm': 100},
        format='json',
    )

    assert response.status_code == 400
    assert 'width_mm' in response.data['error']['fields']


def test_create_print_area_with_non_positive_height_returns_400(admin_client, product_type):
    response = admin_client.post(
        '/api/v1/admin/print-areas',
        {'name': 'Přední', 'productType': str(product_type.id), 'widthMm': 100, 'heightMm': 0},
        format='json',
    )

    assert response.status_code == 400
    assert 'height_mm' in response.data['error']['fields']


def test_create_print_area_with_duplicate_name_for_same_product_type_returns_400(admin_client, product_type, print_area):
    response = admin_client.post(
        '/api/v1/admin/print-areas',
        {'name': print_area.name, 'productType': str(product_type.id), 'widthMm': 50, 'heightMm': 50},
        format='json',
    )

    assert response.status_code == 400
    assert 'name' in response.data['error']['fields']


def test_create_print_area_succeeds(admin_client, product_type):
    response = admin_client.post(
        '/api/v1/admin/print-areas',
        {'name': 'Rukáv', 'productType': str(product_type.id), 'widthMm': 50, 'heightMm': 50},
        format='json',
    )

    assert response.status_code == 201


def test_update_print_area_keeping_its_own_name_succeeds(admin_client, print_area):
    # Exercises the self.instance branch (excluding the print area's own
    # row from the duplicate-name check) on the non-colliding path.
    response = admin_client.patch(f'/api/v1/admin/print-areas/{print_area.id}', {'widthMm': 150}, format='json')

    assert response.status_code == 200
    print_area.refresh_from_db()
    assert print_area.width_mm == 150


def test_updating_motif_variant_to_a_duplicate_combination_returns_409(admin_client, motif, product_type, cut, color):
    other_color = Color.objects.create(name='Bílá', hex_value='#FFFFFF')
    MotifVariant.objects.create(motif=motif, product_type=product_type, cut=cut, color=other_color, size='M')
    variant_to_update = motif.variants.get(color=color, size='M')

    response = admin_client.patch(
        f'/api/v1/admin/motif-variants/{variant_to_update.id}', {'colorId': str(other_color.id)}, format='json',
    )

    assert response.status_code == 409
    assert response.data['error']['code'] == 'DUPLICATE_VARIANT'


# ---------------------------------------------------------------------------
# No N+1 queries on list endpoints
# ---------------------------------------------------------------------------

def test_motif_list_query_count_does_not_grow_with_motif_count(category, django_assert_max_num_queries):
    for i in range(5):
        Motif.objects.create(name=f'Motif {i}', slug=f'motif-{i}', price=10000, category=category)

    with django_assert_max_num_queries(4):
        response = APIClient().get('/api/v1/motifs')

    assert response.status_code == 200
    assert len(response.data['results']) == 5


def test_catalog_options_query_count_does_not_grow_with_product_type_count(django_assert_max_num_queries):
    for i in range(5):
        pt = ProductType.objects.create(name=f'Typ {i}')
        PrintArea.objects.create(product_type=pt, name='Přední strana', width_mm=300, height_mm=400)

    with django_assert_max_num_queries(6):
        response = APIClient().get('/api/v1/catalog/options')

    assert response.status_code == 200
    assert len(response.data['product_types']) == 5


def test_admin_motif_list_query_count_does_not_grow_with_motif_count(admin_client, category, django_assert_max_num_queries):
    for i in range(10):
        Motif.objects.create(name=f'Motif {i}', slug=f'admin-motif-{i}', price=10000, category=category)

    with django_assert_max_num_queries(4):
        response = admin_client.get('/api/v1/admin/motifs')

    assert response.status_code == 200
    assert len(response.data['results']) == 10


# ---------------------------------------------------------------------------
# Motif availability matrix (admin CRUD + public exposure)
# ---------------------------------------------------------------------------

def test_motif_detail_exposes_variants(motif, product_type, cut, color):
    response = APIClient().get(f'/api/v1/motifs/{motif.slug}')

    assert response.status_code == 200
    assert response.data['variants'] == [{
        'product_type_id': str(product_type.id), 'cut_id': str(cut.id), 'color_id': str(color.id), 'size': 'M',
    }]


def test_simple_lookup_str_is_name(category):
    assert str(category) == category.name


def test_motif_variant_str(motif, product_type, cut, color):
    variant = motif.variants.get(product_type=product_type, cut=cut, color=color, size='M')
    assert str(variant) == f'{motif.name} / {product_type.name} / {cut.name} / {color.name} / M'


def test_admin_can_list_motif_variants_for_a_motif(admin_client, motif, product_type, cut, color):
    response = admin_client.get('/api/v1/admin/motif-variants', {'motif': str(motif.id)})

    assert response.status_code == 200
    assert len(response.data['results']) == 1


def test_listing_motif_variants_without_motif_param_returns_400(admin_client):
    response = admin_client.get('/api/v1/admin/motif-variants')
    assert response.status_code == 400


def test_admin_can_create_motif_variant(admin_client, motif, product_type, cut, color):
    response = admin_client.post('/api/v1/admin/motif-variants', {
        'motifId': str(motif.id), 'productTypeId': str(product_type.id),
        'cutId': str(cut.id), 'colorId': str(color.id), 'size': 'L',
    }, format='json')

    assert response.status_code == 201
    assert MotifVariant.objects.filter(motif=motif, size='L').exists()


def test_duplicate_motif_variant_returns_409(admin_client, motif, product_type, cut, color):
    response = admin_client.post('/api/v1/admin/motif-variants', {
        'motifId': str(motif.id), 'productTypeId': str(product_type.id),
        'cutId': str(cut.id), 'colorId': str(color.id), 'size': 'M',
    }, format='json')

    assert response.status_code == 409
    assert response.data['error']['code'] == 'DUPLICATE_VARIANT'


def test_admin_can_delete_motif_variant_and_it_stops_being_orderable(admin_client, motif, product_type, cut, color):
    variant = MotifVariant.objects.get(motif=motif, product_type=product_type, cut=cut, color=color, size='M')

    response = admin_client.delete(f'/api/v1/admin/motif-variants/{variant.id}')
    assert response.status_code == 204

    cart_response = admin_client.post('/api/v1/cart/validate', {'items': [{
        'isCustom': False, 'motifId': str(motif.id), 'productTypeId': str(product_type.id),
        'cutId': str(cut.id), 'colorId': str(color.id), 'size': 'M', 'quantity': 1,
    }]}, format='json')
    assert cart_response.data['items'][0]['valid'] is False
