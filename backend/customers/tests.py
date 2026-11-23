import pytest
from rest_framework.test import APIClient

from accounts.models import User

from .models import Customer

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(email='admin@trikonos.cz', password='x', name='Admin')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def customer():
    return Customer.objects.create(
        email='jana@example.cz', first_name='Jana', last_name='Nováková', phone='+420777123456',
        company_name='Firma s.r.o.', marketing_consent=False,
    )


def test_customer_str_is_email():
    assert str(Customer(email='x@y.cz')) == 'x@y.cz'


def test_retrieve_customer_detail(admin_client, customer):
    response = admin_client.get(f'/api/v1/admin/customers/{customer.id}')

    assert response.status_code == 200
    assert response.data['email'] == customer.email


def test_search_matches_company_name(admin_client, customer):
    response = admin_client.get('/api/v1/admin/customers', {'q': 'Firma'})
    assert response.status_code == 200
    assert [item['id'] for item in response.data['results']] == [str(customer.id)]


def test_search_matches_phone(admin_client, customer):
    response = admin_client.get('/api/v1/admin/customers', {'q': '777123456'})
    assert [item['id'] for item in response.data['results']] == [str(customer.id)]


def test_filter_by_marketing_consent_true_excludes_non_consenting(admin_client, customer):
    consenting = Customer.objects.create(email='petr@example.cz', marketing_consent=True)

    response = admin_client.get('/api/v1/admin/customers', {'marketingConsent': 'true'})

    ids = [item['id'] for item in response.data['results']]
    assert str(consenting.id) in ids
    assert str(customer.id) not in ids


def test_can_patch_basic_fields(admin_client, customer):
    response = admin_client.patch(f'/api/v1/admin/customers/{customer.id}', {'note': 'VIP zákaznice'}, format='json')

    assert response.status_code == 200
    customer.refresh_from_db()
    assert customer.note == 'VIP zákaznice'


def test_can_change_email(admin_client, customer):
    response = admin_client.patch(f'/api/v1/admin/customers/{customer.id}', {'email': 'new@example.cz'}, format='json')

    assert response.status_code == 200
    customer.refresh_from_db()
    assert customer.email == 'new@example.cz'


def test_changing_email_to_an_existing_one_returns_409(admin_client, customer):
    Customer.objects.create(email='taken@example.cz')

    response = admin_client.patch(f'/api/v1/admin/customers/{customer.id}', {'email': 'taken@example.cz'}, format='json')

    assert response.status_code == 409
    assert response.data['error']['code'] == 'EMAIL_TAKEN'


def test_export_consents_requires_authentication():
    response = APIClient().get('/api/v1/admin/customers/export-consents')
    assert response.status_code in (401, 403)


def test_export_consents_only_lists_consenting_customers(admin_client, customer):
    consenting = Customer.objects.create(email='souhlas@example.cz', marketing_consent=True)

    response = admin_client.get('/api/v1/admin/customers/export-consents', HTTP_ACCEPT='*/*')

    assert response.status_code == 200
    assert response['Content-Type'] == 'text/csv'
    body = response.content.decode('utf-8')
    assert consenting.email in body
    assert customer.email not in body
    assert 'no-store' in response['Cache-Control']


def test_frontend_camel_case_customer_update_requires_session_and_csrf(customer):
    client = APIClient(enforce_csrf_checks=True)
    url = f'/api/v1/admin/customers/{customer.id}'
    assert client.get(url).status_code == 403
    client.force_login(User.objects.create_user(email='customer-editor@example.cz', password='test-only'))
    body = {'firstName': 'Janina', 'email': 'NEW@EXAMPLE.CZ', 'marketingConsent': True, 'note': 'Telefonicky ověřeno.'}
    assert client.patch(url, body, format='json').status_code == 403
    token = client.get('/api/v1/admin/auth/csrf')['X-CSRFToken']
    response = client.patch(url, body, format='json', HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 200
    assert response.json()['firstName'] == 'Janina'
    assert response.json()['email'] == 'new@example.cz'
    assert response.json()['marketingConsent'] is True
    assert 'no-store' in response['Cache-Control']
    Customer.objects.create(email='taken@example.cz')
    conflict = client.patch(url, {'email': 'TAKEN@example.cz', 'note': 'Must not save'}, format='json', HTTP_X_CSRFTOKEN=token)
    assert conflict.status_code == 409
    assert conflict.json()['error']['code'] == 'EMAIL_TAKEN'
    assert 'no-store' in conflict['Cache-Control']
    customer.refresh_from_db()
    assert customer.email == 'new@example.cz'
    assert customer.note == 'Telefonicky ověřeno.'


def test_history_totals_and_global_consent_export_match_existing_contract(admin_client, customer):
    from orders.models import Order
    Order.objects.create(customer=customer, order_number='TRK-CUSTOMER-CANCELLED', status='CANCELLED', total=12300)
    Order.objects.create(customer=customer, order_number='TRK-CUSTOMER-QUOTE', status='QUOTE_REQUESTED', total=None)
    detail = admin_client.get(f'/api/v1/admin/customers/{customer.id}')
    assert detail.status_code == 200
    assert detail.json()['ordersCount'] == 2
    assert detail.json()['totalSpent'] == 12300  # Includes cancelled; not paid revenue.
    assert len(detail.json()['orders']) == 2
    assert any(order['total'] is None for order in detail.json()['orders'])
    history = admin_client.get('/api/v1/admin/orders', {'customer': str(customer.id)})
    assert history.status_code == 200
    assert history.json()['count'] == 2
    consenting = Customer.objects.create(email='all-consent@example.cz', marketing_consent=True)
    exported = admin_client.get('/api/v1/admin/customers/export-consents', {'q': 'does-not-match', 'marketingConsent': 'false'}, HTTP_ACCEPT='*/*')
    assert exported.status_code == 200
    assert exported['Content-Type'].startswith('text/csv')
    assert consenting.email in exported.content.decode()
    assert customer.email not in exported.content.decode()


def test_list_query_count_does_not_grow_with_customer_count(admin_client, django_assert_max_num_queries):
    for i in range(15):
        Customer.objects.create(email=f'customer{i}@example.cz')

    with django_assert_max_num_queries(4):
        response = admin_client.get('/api/v1/admin/customers')

    assert response.status_code == 200
    assert len(response.data['results']) == 15
