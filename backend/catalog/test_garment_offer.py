import pytest
from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Color, Motif
from core.exceptions import BusinessError
from orders.services import _validate_and_price_item


pytestmark = pytest.mark.django_db
OFFER = '/api/v1/admin/garment-offer'


@pytest.fixture
def admin_api():
    user = User.objects.create_user(email='offer@example.cz', password='test', name='Offer')
    client = APIClient()
    client.force_authenticate(user)
    return client


def variant(product_type, cut, color, size):
    return {'productTypeId': str(product_type.pk), 'cutId': str(cut.pk), 'colorId': str(color.pk), 'size': size}


def put_offer(client, rows):
    revision = client.get(OFFER).json()['revision']
    return client.put(OFFER, {'revision': revision, 'variants': rows}, format='json')


def test_motif_default_color_must_be_offered_and_can_be_cleared(admin_api, motif, product_type, cut, color):
    path = f'/api/v1/admin/motifs/{motif.pk}'
    public = f'/api/v1/motifs/{motif.slug}'
    other = Color.objects.create(name='Zelená', hex_value='#00FF00')
    assert admin_api.patch(path, {'defaultColorId': str(other.pk)}, format='json').status_code == 400
    saved = admin_api.patch(path, {'defaultColorId': str(color.pk)}, format='json')
    assert saved.status_code == 200, saved.json()
    assert saved.json()['defaultColorId'] == str(color.pk)
    assert APIClient().get(public).json()['defaultColorId'] == str(color.pk)
    assert admin_api.patch(path, {'defaultColorId': None}, format='json').status_code == 200
    assert APIClient().get(public).json()['defaultColorId'] is None


def test_offer_replace_is_admin_only_and_rejects_stale_and_invalid_writes(admin_api, product_type, cut, color):
    assert APIClient().get(OFFER).status_code in (401, 403)
    original = admin_api.get(OFFER).json()
    row = variant(product_type, cut, color, 'M')
    duplicate = admin_api.put(OFFER, {**original, 'variants': [row, row]}, format='json')
    assert duplicate.status_code == 400
    invalid = admin_api.put(OFFER, {**original, 'variants': [{**row, 'size': '4XL'}]}, format='json')
    assert invalid.status_code == 400
    saved = admin_api.put(OFFER, {**original, 'variants': [row]}, format='json')
    assert saved.status_code == 200, saved.json()
    assert saved.json()['variants'] == [row]
    stale = admin_api.put(OFFER, original, format='json')
    assert stale.status_code == 409
    assert stale.json()['error']['code'] == 'GARMENT_OFFER_CHANGED'
    assert admin_api.get(OFFER).json() == saved.json()


def test_shared_offer_is_projected_into_motif_detail_and_checkout(admin_api, motif, product_type, cut, color):
    white = Color.objects.create(name='Bílá', hex_value='#FFFFFF')
    black_m = variant(product_type, cut, color, 'M')
    white_l = variant(product_type, cut, white, 'L')
    assert put_offer(admin_api, [black_m, white_l]).status_code == 200
    other = Motif.objects.create(name='Hory', slug='hory', price=200, category=motif.category)
    public = APIClient()

    def detail(subject):
        return public.get(f'/api/v1/motifs/{subject.slug}').json()['variants']

    assert {row['size'] for row in detail(motif)} == {'M', 'L'}
    assert {row['size'] for row in detail(other)} == {'M', 'L'}
    assert {row['size'] for row in public.get('/api/v1/catalog/options').json()['garmentVariants']} == {'M', 'L'}
    assert public.get('/api/v1/motifs').json()['count'] == 2

    path = f'/api/v1/admin/motifs/{other.pk}'
    filtered = admin_api.patch(path, {'garmentExclusions': [{
        'productTypeId': str(product_type.pk), 'cutId': str(cut.pk), 'colorId': str(color.pk),
    }]}, format='json')
    assert filtered.status_code == 200, filtered.json()
    assert detail(other) == [white_l]
    other.refresh_from_db()
    item = dict(is_custom=False, motif=other, product_type=product_type, cut=cut, color=white, size='L', quantity=2)
    assert _validate_and_price_item(item)[1] == other.price + product_type.price
    with pytest.raises(BusinessError) as unavailable:
        _validate_and_price_item({**item, 'color': color, 'size': 'M'})
    assert unavailable.value.code == 'VARIANT_NOT_AVAILABLE'

    added = variant(product_type, cut, white, 'XL')
    assert put_offer(admin_api, [black_m, added]).status_code == 200
    assert detail(other) == [added]
    assert {row['size'] for row in detail(motif)} == {'M', 'XL'}
    white.delete()
    assert detail(other) == []


def test_custom_print_checks_the_same_shared_offer(admin_api, print_area, product_type, cut, color):
    item = dict(
        is_custom=True, product_type=product_type, cut=cut, color=color, size='M', quantity=1,
        placements=[{'print_area': print_area, 'url': 'https://example.cz/design.png', 'width': 10, 'height': 10}],
    )
    assert _validate_and_price_item(item)[1] is None
    assert put_offer(admin_api, []).status_code == 200
    with pytest.raises(BusinessError) as unavailable:
        _validate_and_price_item(item)
    assert unavailable.value.code == 'VARIANT_NOT_AVAILABLE'


def test_child_and_universal_sizes_are_listed_and_orderable_when_offered(admin_api, motif, product_type, cut, color):
    sizes = {
        '110': '4 roky – 110 cm', '122': '6 let – 122 cm', '134': '8 let – 134 cm',
        '146': '10 let – 146 cm', '158': '12 let – 158 cm',
        'UNI': 'Jednotná',
    }
    public = APIClient()
    dictionary = {row['value']: row['label'] for row in public.get('/api/v1/catalog/options').json()['sizes']}
    assert {code: dictionary[code] for code in sizes} == sizes
    assert put_offer(admin_api, [variant(product_type, cut, color, size) for size in sizes]).status_code == 200
    cart = public.post('/api/v1/cart/validate', {'items': [
        {**variant(product_type, cut, color, size), 'isCustom': False, 'motifId': str(motif.pk), 'quantity': 1}
        for size in sizes
    ]}, format='json')
    assert cart.status_code == 200, cart.json()
    assert len(cart.json()['items']) == len(sizes)
    assert all(item['valid'] for item in cart.json()['items'])


def test_motif_exclusions_are_subtractive_and_checked_at_checkout(admin_api, motif, product_type, cut, color):
    white = Color.objects.create(name='Bílá', hex_value='#FFFFFF')
    black_m = variant(product_type, cut, color, 'M')
    black_l = variant(product_type, cut, color, 'L')
    white_m = variant(product_type, cut, white, 'M')
    white_l = variant(product_type, cut, white, 'L')
    assert put_offer(admin_api, [black_m, black_l, white_m, white_l]).status_code == 200
    pair = {key: black_m[key] for key in ('productTypeId', 'cutId')}
    hide_color = {**pair, 'colorId': str(white.pk)}
    hide_size = {**pair, 'size': 'L'}
    path = f'/api/v1/admin/motifs/{motif.pk}'
    for invalid in ([{**pair, 'size': 'S'}], [{**hide_color, 'size': 'L'}], [hide_color, hide_color]):
        assert admin_api.patch(path, {'garmentExclusions': invalid}, format='json').status_code == 400
    saved = admin_api.patch(path, {'garmentExclusions': [hide_color, hide_size]}, format='json')
    assert saved.status_code == 200, saved.json()
    assert saved.json()['garmentExclusions'] == [hide_color, hide_size]
    detail = f'/api/v1/motifs/{motif.slug}'
    assert APIClient().get(detail).json()['variants'] == [black_m]
    motif.refresh_from_db()
    item = dict(is_custom=False, motif=motif, product_type=product_type, cut=cut, color=color, quantity=1)
    assert _validate_and_price_item({**item, 'size': 'M'})[1] == motif.price + product_type.price
    with pytest.raises(BusinessError) as unavailable:
        _validate_and_price_item({**item, 'size': 'L'})
    assert unavailable.value.code == 'VARIANT_NOT_AVAILABLE'

    assert put_offer(admin_api, [black_m]).status_code == 200
    # Unavailable existing rules can be retained or removed, but not newly added.
    assert admin_api.patch(path, {'garmentExclusions': [hide_color]}, format='json').status_code == 200
    assert admin_api.patch(path, {'garmentExclusions': [hide_color, hide_size]}, format='json').status_code == 400
    assert put_offer(admin_api, [black_m, white_m]).status_code == 200
    assert APIClient().get(detail).json()['variants'] == [black_m]
    assert admin_api.patch(path, {'garmentExclusions': [pair]}, format='json').status_code == 200
    assert APIClient().get(detail).json()['variants'] == []


def test_motif_duplication_preserves_exclusions_even_when_currently_unavailable(admin_api, motif, product_type, cut, color):
    row = variant(product_type, cut, color, 'M')
    path = f'/api/v1/admin/motifs/{motif.pk}'
    assert admin_api.patch(path, {'garmentExclusions': [{key: row[key] for key in ('productTypeId', 'cutId')}]}, format='json').status_code == 200
    assert put_offer(admin_api, []).status_code == 200
    copy = admin_api.post('/api/v1/admin/motifs', {
        'name': 'Kopie', 'price': 100, 'category': str(motif.category_id),
        'copyRestrictionsFrom': str(motif.pk), 'isActive': True,
    }, format='json')
    assert copy.status_code == 201, copy.json()
    assert copy.json()['garmentExclusions'] == admin_api.get(path).json()['garmentExclusions']
    assert put_offer(admin_api, [row]).status_code == 200
    assert APIClient().get('/api/v1/motifs/kopie').json()['variants'] == []
