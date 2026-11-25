import re

import requests
from django.conf import settings

from core.exceptions import BusinessError


VALIDATE_URL = 'https://widget.packeta.com/v6/pps/api/widget/v1/validate'


def validate_pickup_point(point_id, *, cash_on_delivery):
    """Validate a Czech Packeta branch or Z-BOX without creating a packet."""
    if not re.fullmatch(r'[1-9][0-9]{0,99}', point_id):
        raise BusinessError('Vyberte platné výdejní místo na mapě Zásilkovny.', code='INVALID_PICKUP_POINT')

    unavailable = 'Výdejní místo se nepodařilo ověřit. Zkuste to znovu nebo zvolte jinou dopravu.'
    api_key = settings.SHOP_CONFIG.get('PACKETA_WIDGET_API_KEY', '').strip()
    if not api_key:
        raise BusinessError(unavailable, code='PICKUP_VALIDATION_UNAVAILABLE')

    try:
        response = requests.post(VALIDATE_URL, json={
            'apiKey': api_key,
            'point': {'id': point_id},
            'options': {
                'country': 'cz',
                'carriers': 'packeta',
                'vendors': [{'country': 'cz'}, {'country': 'cz', 'group': 'zbox'}],
                'cashOnDelivery': cash_on_delivery,
            },
        }, headers={'X-Language': 'cs'}, timeout=(2, 4), allow_redirects=False)
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError):
        raise BusinessError(unavailable, code='PICKUP_VALIDATION_UNAVAILABLE') from None

    if not isinstance(result, dict) or not isinstance(result.get('isValid'), bool):
        raise BusinessError(unavailable, code='PICKUP_VALIDATION_UNAVAILABLE')
    if not result['isValid']:
        raise BusinessError(
            'Vybrané výdejní místo není pro tuto objednávku dostupné. Vyberte jiné místo nebo změňte platbu.',
            code='INVALID_PICKUP_POINT',
        )

    point = result.get('point')
    name = point.get('name') if isinstance(point, dict) else None
    if not isinstance(name, str) or not 0 < len(name.strip()) <= 255:
        raise BusinessError(unavailable, code='PICKUP_VALIDATION_UNAVAILABLE')
    name = name.strip()
    address = point.get('address')
    if isinstance(address, dict):
        location = [address.get(field) for field in ('city', 'street')]
        parts = [value.strip() for value in location if isinstance(value, str) and value.strip()]
        if parts and not all(part.casefold() in name.casefold() for part in parts):
            full_name = f'{name} – {", ".join(parts)}'
            if len(full_name) <= 255:
                return full_name
    return name
