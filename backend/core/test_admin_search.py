import pytest
from rest_framework.test import APIClient
from accounts.models import User
from customers.models import Customer
from orders.models import Order

@pytest.mark.django_db
def test_global_search_contract_and_private_cache_headers(motif):
    client = APIClient()
    assert client.get('/api/v1/admin/search', {'q': 'Needle'}).status_code == 403
    client.force_authenticate(User.objects.create_user(email='search@example.cz', password='test-only'))
    customers = [Customer.objects.create(email=f'needle{index}@example.cz', first_name='Needle') for index in range(6)]
    Order.objects.create(customer=customers[0], order_number='TRK-Needle', total=10000)
    motif.name = 'Needle motif'
    motif.save()
    response = client.get('/api/v1/admin/search', {'q': 'Needle'})
    assert response.status_code == 200
    assert 'no-store' in response['Cache-Control']
    assert len(response.json()['customers']) == 5
    assert response.json()['orders'][0]['orderNumber'] == 'TRK-Needle'
    assert response.json()['motifs'][0]['id'] == str(motif.id)
    assert client.get('/api/v1/admin/search').json() == {'orders': [], 'customers': [], 'motifs': []}
