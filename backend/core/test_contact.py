from unittest.mock import patch

import pytest
from django.core import mail
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

BODY = {
    'name': 'Jana Nováková', 'email': 'jana@example.cz', 'phone': '777123456',
    'company': 'Horský tým', 'message': 'Poptáváme týmová trička.', 'website': '',
}


def test_contact_sends_message_and_honeypot_sends_nothing(settings):
    settings.SHOP_CONFIG = {**settings.SHOP_CONFIG, 'NOTIFY_EMAIL': 'shop@example.cz'}
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    client = APIClient()
    assert client.post('/api/v1/contact', BODY, format='json').status_code == 204
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ['shop@example.cz']
    assert BODY['message'] in mail.outbox[0].body
    assert BODY['email'] in mail.outbox[0].body
    assert client.post('/api/v1/contact', {**BODY, 'website': 'https://bot.example'}, format='json').status_code == 204
    assert len(mail.outbox) == 1


def test_contact_reports_missing_recipient_and_email_failure_without_false_success(settings):
    client = APIClient()
    settings.SHOP_CONFIG = {**settings.SHOP_CONFIG, 'NOTIFY_EMAIL': ''}
    with patch('core.views.send_templated_email') as send:
        missing = client.post('/api/v1/contact', BODY, format='json')
        assert missing.status_code == 503
        assert missing.json()['error']['code'] == 'CONTACT_UNAVAILABLE'
        send.assert_not_called()
    settings.SHOP_CONFIG = {**settings.SHOP_CONFIG, 'NOTIFY_EMAIL': 'shop@example.cz'}
    for result in [OSError('SMTP unavailable'), 0]:
        with patch('core.emails.EmailMultiAlternatives.send', side_effect=result if isinstance(result, Exception) else None, return_value=0):
            response = client.post('/api/v1/contact', BODY, format='json')
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'CONTACT_UNAVAILABLE'
        assert BODY['email'] not in response.content.decode()


def test_order_notifications_keep_swallowing_email_failure():
    from core.emails import send_templated_email
    with patch('core.emails.EmailMultiAlternatives.send', side_effect=OSError('SMTP unavailable')):
        send_templated_email('contact_message', BODY, 'Test', ['shop@example.cz'])
