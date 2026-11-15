import uuid

from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
import pytest
from rest_framework.test import APIClient

from .models import User

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _isolate_throttle_cache():
    # LoginView, PasswordResetRequestView and PasswordResetConfirmView all
    # share the 'login' ScopedRateThrottle bucket, keyed by IP - without
    # resetting it, requests made by one test count against the next one
    # (all tests use the same client IP), causing unrelated tests to fail
    # with 429 depending on run order.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_user():
    return User.objects.create_user(email='admin@trikonos.cz', password='correct-horse', name='Admin')


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def test_login_success_starts_session(admin_user):
    client = APIClient()
    response = client.post('/api/v1/admin/auth/login', {'email': admin_user.email, 'password': 'correct-horse'}, format='json')

    assert response.status_code == 200
    assert response.data['email'] == admin_user.email


def test_login_wrong_password_and_wrong_email_return_the_same_error(admin_user):
    client = APIClient()
    wrong_password = client.post('/api/v1/admin/auth/login', {'email': admin_user.email, 'password': 'nope'}, format='json')
    wrong_email = client.post('/api/v1/admin/auth/login', {'email': 'nobody@trikonos.cz', 'password': 'nope'}, format='json')

    assert wrong_password.status_code == wrong_email.status_code == 401
    assert wrong_password.data['error']['message'] == wrong_email.data['error']['message']


def test_login_rejects_inactive_user(admin_user):
    admin_user.is_active = False
    admin_user.save(update_fields=['is_active'])
    client = APIClient()

    response = client.post('/api/v1/admin/auth/login', {'email': admin_user.email, 'password': 'correct-horse'}, format='json')

    assert response.status_code == 401


def test_login_is_throttled_after_five_attempts_per_minute(admin_user):
    client = APIClient()
    for _attempt in range(5):
        response = client.post('/api/v1/admin/auth/login', {'email': admin_user.email, 'password': 'nope'}, format='json')
        assert response.status_code == 401

    response = client.post('/api/v1/admin/auth/login', {'email': admin_user.email, 'password': 'nope'}, format='json')
    assert response.status_code == 429


# ---------------------------------------------------------------------------
# CSRF / logout / me
# ---------------------------------------------------------------------------

def test_csrf_view_sets_cookie():
    response = APIClient().get('/api/v1/admin/auth/csrf')

    assert response.status_code == 204
    assert 'csrftoken' in response.cookies


def test_logout_ends_session(admin_client):
    response = admin_client.post('/api/v1/admin/auth/logout')

    assert response.status_code == 204


def test_me_returns_current_user_profile(admin_client, admin_user):
    response = admin_client.get('/api/v1/admin/auth/me')

    assert response.status_code == 200
    assert response.data['email'] == admin_user.email
    assert response.data['name'] == admin_user.name


# ---------------------------------------------------------------------------
# Change password (self-service, authenticated)
# ---------------------------------------------------------------------------

def test_change_password_requires_correct_current_password(admin_client):
    response = admin_client.post(
        '/api/v1/admin/auth/password', {'currentPassword': 'wrong', 'newPassword': 'a-new-strong-pass9'}, format='json',
    )

    assert response.status_code == 400


def test_change_password_rejects_weak_new_password(admin_client):
    response = admin_client.post(
        '/api/v1/admin/auth/password', {'currentPassword': 'correct-horse', 'newPassword': '123'}, format='json',
    )

    assert response.status_code == 400
    assert 'new_password' in response.data['error']['fields']


def test_change_password_success_allows_login_with_new_password(admin_client, admin_user):
    response = admin_client.post(
        '/api/v1/admin/auth/password',
        {'currentPassword': 'correct-horse', 'newPassword': 'a-new-strong-pass9'},
        format='json',
    )
    assert response.status_code == 204

    fresh_client = APIClient()
    login_response = fresh_client.post(
        '/api/v1/admin/auth/login', {'email': admin_user.email, 'password': 'a-new-strong-pass9'}, format='json',
    )
    assert login_response.status_code == 200


# ---------------------------------------------------------------------------
# Password reset request - never reveals whether the e-mail exists
# ---------------------------------------------------------------------------

def test_password_reset_request_for_existing_email_sends_mail_and_returns_204(admin_user):
    client = APIClient()
    response = client.post('/api/v1/admin/auth/password-reset', {'email': admin_user.email}, format='json')

    assert response.status_code == 204
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [admin_user.email]


def test_password_reset_request_for_unknown_email_sends_no_mail_but_still_returns_204():
    client = APIClient()
    response = client.post('/api/v1/admin/auth/password-reset', {'email': 'nobody@trikonos.cz'}, format='json')

    assert response.status_code == 204
    assert len(mail.outbox) == 0


# ---------------------------------------------------------------------------
# Password reset confirm
# ---------------------------------------------------------------------------

def _reset_link_params(user):
    return {
        'uid': urlsafe_base64_encode(force_bytes(user.pk)),
        'token': default_token_generator.make_token(user),
    }


def test_password_reset_confirm_with_valid_token_sets_new_password(admin_user):
    params = _reset_link_params(admin_user)
    client = APIClient()

    response = client.post(
        '/api/v1/admin/auth/password-reset/confirm', {**params, 'newPassword': 'a-new-strong-pass9'}, format='json',
    )

    assert response.status_code == 204
    login_response = client.post(
        '/api/v1/admin/auth/login', {'email': admin_user.email, 'password': 'a-new-strong-pass9'}, format='json',
    )
    assert login_response.status_code == 200


def test_password_reset_confirm_with_invalid_token_rejected(admin_user):
    params = _reset_link_params(admin_user)
    client = APIClient()

    response = client.post(
        '/api/v1/admin/auth/password-reset/confirm',
        {**params, 'token': 'not-a-real-token', 'newPassword': 'a-new-strong-pass9'},
        format='json',
    )

    assert response.status_code == 400


def test_password_reset_confirm_token_cannot_be_reused(admin_user):
    params = _reset_link_params(admin_user)
    client = APIClient()
    first = client.post(
        '/api/v1/admin/auth/password-reset/confirm', {**params, 'newPassword': 'a-new-strong-pass9'}, format='json',
    )
    assert first.status_code == 204

    # Same token again, after the password it was issued for has already
    # changed - Django's default_token_generator ties the token to the
    # password hash, so a reused link must fail.
    second = client.post(
        '/api/v1/admin/auth/password-reset/confirm', {**params, 'newPassword': 'yet-another-pass9'}, format='json',
    )
    assert second.status_code == 400


def test_password_reset_confirm_with_unknown_uid_rejected():
    client = APIClient()
    response = client.post(
        '/api/v1/admin/auth/password-reset/confirm',
        {'uid': urlsafe_base64_encode(force_bytes('does-not-exist')), 'token': 'whatever', 'newPassword': 'a-new-strong-pass9'},
        format='json',
    )

    assert response.status_code == 400


def test_password_reset_confirm_with_well_formed_but_nonexistent_uid_rejected():
    # Distinct from the case above: a syntactically valid UUID that simply
    # doesn't belong to any user, to specifically exercise the
    # User.DoesNotExist branch rather than the ValueError-on-decode branch.
    client = APIClient()
    response = client.post(
        '/api/v1/admin/auth/password-reset/confirm',
        {
            'uid': urlsafe_base64_encode(force_bytes(str(uuid.uuid4()))),
            'token': 'whatever', 'newPassword': 'a-new-strong-pass9',
        },
        format='json',
    )

    assert response.status_code == 400


def test_password_reset_confirm_rejects_weak_new_password(admin_user):
    params = _reset_link_params(admin_user)
    client = APIClient()

    response = client.post(
        '/api/v1/admin/auth/password-reset/confirm', {**params, 'newPassword': '123'}, format='json',
    )

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Admin user management - last-admin / self-delete safeguards
# ---------------------------------------------------------------------------

def test_unauthenticated_cannot_access_admin_user_management():
    client = APIClient()
    response = client.get('/api/v1/admin/users')
    assert response.status_code in (401, 403)


def test_admin_cannot_delete_own_account(admin_client, admin_user):
    response = admin_client.delete(f'/api/v1/admin/users/{admin_user.id}')
    assert response.status_code == 403
    assert User.objects.filter(pk=admin_user.id).exists()


def test_can_delete_a_user_when_another_active_user_remains(admin_user):
    other_user = User.objects.create_user(email='admin2@trikonos.cz', password='x', name='Admin 2')
    client = APIClient()
    client.force_authenticate(user=other_user)

    response = client.delete(f'/api/v1/admin/users/{admin_user.id}')

    assert response.status_code == 204
    assert not User.objects.filter(pk=admin_user.id).exists()


def test_cannot_deactivate_the_last_active_user(admin_client, admin_user):
    response = admin_client.patch(f'/api/v1/admin/users/{admin_user.id}', {'isActive': False}, format='json')

    assert response.status_code == 409
    assert response.data['error']['code'] == 'LAST_ADMIN'
    admin_user.refresh_from_db()
    assert admin_user.is_active is True


def test_create_user_without_password_sends_setup_email_with_unusable_password(admin_client):
    response = admin_client.post(
        '/api/v1/admin/users', {'email': 'new@trikonos.cz', 'name': 'Nový'}, format='json',
    )

    assert response.status_code == 201
    user = User.objects.get(email='new@trikonos.cz')
    assert not user.has_usable_password()
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ['new@trikonos.cz']


def test_create_user_with_password_does_not_send_email(admin_client):
    response = admin_client.post(
        '/api/v1/admin/users',
        {'email': 'new2@trikonos.cz', 'name': 'Nový', 'password': 'a-strong-enough-pass9'},
        format='json',
    )

    assert response.status_code == 201
    user = User.objects.get(email='new2@trikonos.cz')
    assert user.check_password('a-strong-enough-pass9')
    assert len(mail.outbox) == 0


def test_list_and_retrieve_admin_users(admin_client, admin_user):
    list_response = admin_client.get('/api/v1/admin/users')
    assert list_response.status_code == 200
    assert any(row['email'] == admin_user.email for row in list_response.data['results'])

    detail_response = admin_client.get(f'/api/v1/admin/users/{admin_user.id}')
    assert detail_response.status_code == 200
    assert detail_response.data['email'] == admin_user.email


def test_partial_update_renames_user(admin_client, admin_user):
    other_user = User.objects.create_user(email='admin2@trikonos.cz', password='x', name='Admin 2')

    response = admin_client.patch(f'/api/v1/admin/users/{other_user.id}', {'name': 'Nové jméno'}, format='json')

    assert response.status_code == 200
    other_user.refresh_from_db()
    assert other_user.name == 'Nové jméno'


def test_destroy_fails_when_target_is_the_last_active_admin_even_if_not_self(admin_user):
    # The acting user is deactivated (but still authenticated - IsAdmin only
    # checks is_authenticated, not is_active) and tries to delete a
    # different user who happens to be the only remaining active admin.
    # Neither safeguard alone would catch this: it's not a self-delete, and
    # a naive "is there another active user besides me" check keyed off the
    # acting user (rather than the target) would miss it too.
    admin_user.is_active = False
    admin_user.save(update_fields=['is_active'])
    client = APIClient()
    client.force_authenticate(user=admin_user)
    target = User.objects.create_user(email='only-active@trikonos.cz', password='x', name='Only Active')

    response = client.delete(f'/api/v1/admin/users/{target.id}')

    assert response.status_code == 409
    assert response.data['error']['code'] == 'LAST_ADMIN'
    assert User.objects.filter(pk=target.pk).exists()


def test_create_user_with_duplicate_email_returns_409(admin_client, admin_user):
    response = admin_client.post(
        '/api/v1/admin/users', {'email': admin_user.email, 'name': 'Duplicate'}, format='json',
    )

    assert response.status_code == 409
    assert response.data['error']['code'] == 'EMAIL_TAKEN'


# ---------------------------------------------------------------------------
# UserManager / User model
# ---------------------------------------------------------------------------

def test_create_user_without_email_raises():
    with pytest.raises(ValueError):
        User.objects.create_user(email='', password='x', name='Nobody')


def test_create_superuser_sets_staff_and_superuser_flags():
    user = User.objects.create_superuser(email='root@trikonos.cz', password='x', name='Root')

    assert user.is_staff is True
    assert user.is_superuser is True


def test_create_superuser_rejects_is_staff_false():
    with pytest.raises(ValueError):
        User.objects.create_superuser(email='root2@trikonos.cz', password='x', name='Root', is_staff=False)


def test_create_superuser_rejects_is_superuser_false():
    with pytest.raises(ValueError):
        User.objects.create_superuser(email='root3@trikonos.cz', password='x', name='Root', is_superuser=False)


def test_user_str_is_email():
    user = User(email='someone@trikonos.cz', name='Someone')
    assert str(user) == 'someone@trikonos.cz'
