import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def send_templated_email(template_name, context, subject, recipient_list, *, raise_on_failure=False):
    """Renders templates/emails/{template_name}.html and .txt and sends
    both as a multipart message - every order/account notification goes
    through this one function.

    Swallows and logs send failures by default: order/account notifications
    are invoked from a transaction.on_commit callback, and an exception
    raised from on_commit propagates into the view's response cycle - an
    SMTP outage would otherwise turn into a 500 for an order that was
    already committed, inviting the customer to resubmit and double-order.
    Contact forms use raise_on_failure=True to report an unavailable sender.
    """
    full_context = {
        **context,
        'shop_name': settings.SHOP_CONFIG['NAME'],
        'contact_email': settings.SHOP_CONFIG['CONTACT_EMAIL'],
    }
    text_body = render_to_string(f'emails/{template_name}.txt', full_context)
    html_body = render_to_string(f'emails/{template_name}.html', full_context)

    message = EmailMultiAlternatives(subject, text_body, settings.DEFAULT_FROM_EMAIL, recipient_list)
    message.attach_alternative(html_body, 'text/html')
    try:
        sent = message.send()
        if raise_on_failure and sent != 1:
            raise RuntimeError('Email backend did not accept the message.')
    except Exception:
        if raise_on_failure:
            raise
        logger.exception('Failed to send "%s" email to %s', template_name, recipient_list)
