import base64
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
import requests

from orders import pohoda_client
from orders.pohoda_client import (
    PohodaConnectionError,
    PohodaProtocolError,
    build_invoice_xml,
    build_print_request_xml,
    parse_invoice_response,
    parse_print_response,
)


def _invoice(**overrides):
    fields = dict(
        request_id=uuid.uuid4(),
        order_number='TRK-2026-0001',
        currency='CZK',
        subtotal_amount=59900,
        shipping_cost_amount=5000,
        total_amount=64900,
        billing_snapshot={
            'full_name': 'Jana Nováková', 'company_name': '', 'ico': '', 'dic': '',
            'street': 'Horní 12', 'city': 'Vrchlabí', 'zip': '54301', 'country': 'CZ',
        },
        items_snapshot=[{'label': 'Bitcoin / Men / Black / M', 'unit_price': 59900, 'quantity': 1}],
    )
    fields.update(overrides)
    return SimpleNamespace(**fields)


def test_build_invoice_xml_contains_request_id_as_datapack_and_item_id(settings):
    settings.POHODA_ICO = '12345678'
    settings.POHODA_APPLICATION_NAME = 'Trikonos'
    settings.POHODA_VAT_RATE_PERCENT = '21'
    settings.POHODA_VAT_RATE_CODE = 'high'
    invoice = _invoice()

    xml_bytes = build_invoice_xml(invoice)
    xml_text = xml_bytes.decode('utf-8')

    request_id = str(invoice.request_id)
    assert f'id="{request_id}"' in xml_text
    assert xml_text.count(f'id="{request_id}"') == 2  # dataPack + dataPackItem
    assert invoice.order_number in xml_text
    assert 'Bitcoin / Men / Black / M' in xml_text
    assert 'Doprava' in xml_text  # shipping line included when shipping_cost_amount > 0


def test_build_invoice_xml_omits_shipping_line_when_free(settings):
    settings.POHODA_ICO = ''
    invoice = _invoice(shipping_cost_amount=0)

    xml_text = build_invoice_xml(invoice).decode('utf-8')

    assert 'Doprava' not in xml_text


def test_build_invoice_xml_omits_blank_numbering_series(settings):
    settings.POHODA_NUMBERING_SERIES = ''
    invoice = _invoice()

    xml_text = build_invoice_xml(invoice).decode('utf-8')

    assert 'numberingSeries' not in xml_text


_RESPONSE_SUCCESS = b'''<?xml version="1.0" encoding="utf-8"?>
<rsp:responsePack xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd"
                   xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
                   xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" id="abc" state="ok">
  <rsp:responsePackItem state="ok">
    <rsp:producedDetails id="42">
      <inv:number><typ:ids>2026001</typ:ids></inv:number>
    </rsp:producedDetails>
  </rsp:responsePackItem>
</rsp:responsePack>'''

_RESPONSE_DUPLICATE = b'''<?xml version="1.0" encoding="utf-8"?>
<rsp:responsePack xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd" id="abc" state="error">
  <rsp:responsePackItem state="error">
    <rsp:detail code="1101"/>
    <rsp:note>Duplicitni zaznam - doklad uz byl importovan.</rsp:note>
  </rsp:responsePackItem>
</rsp:responsePack>'''

_RESPONSE_REJECTED = b'''<?xml version="1.0" encoding="utf-8"?>
<rsp:responsePack xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd" id="abc" state="error">
  <rsp:responsePackItem state="error">
    <rsp:detail code="603"/>
    <rsp:note>Missing required field 'date'.</rsp:note>
  </rsp:responsePackItem>
</rsp:responsePack>'''

_RESPONSE_UNKNOWN_SHAPE = b'<html><body>not pohoda</body></html>'


def test_parse_invoice_response_issued():
    result = parse_invoice_response(_RESPONSE_SUCCESS)

    assert result.outcome == 'issued'
    assert result.invoice_number == '2026001'
    assert result.internal_id == '42'


def test_parse_invoice_response_duplicate():
    result = parse_invoice_response(_RESPONSE_DUPLICATE)

    assert result.outcome == 'duplicate'


def test_parse_invoice_response_rejected():
    result = parse_invoice_response(_RESPONSE_REJECTED)

    assert result.outcome == 'rejected'
    assert result.error_code == '603'
    assert 'date' in result.error_message


def test_parse_invoice_response_unknown_shape_raises_protocol_error():
    with pytest.raises(PohodaProtocolError):
        parse_invoice_response(_RESPONSE_UNKNOWN_SHAPE)


def test_post_raises_connection_error_on_timeout(settings):
    settings.POHODA_URL = 'http://pohoda.example/xml'
    settings.POHODA_USERNAME = 'user'
    settings.POHODA_PASSWORD = 'pass'
    settings.POHODA_CONNECT_TIMEOUT = 1
    settings.POHODA_READ_TIMEOUT = 1

    with patch('orders.pohoda_client.requests.post', side_effect=requests.Timeout):
        with pytest.raises(PohodaConnectionError):
            pohoda_client._post(b'<x/>')


def test_post_sends_stw_authorization_header(settings):
    settings.POHODA_URL = 'http://pohoda.example/xml'
    settings.POHODA_USERNAME = 'user'
    settings.POHODA_PASSWORD = 'pass'

    with patch('orders.pohoda_client.requests.post') as post:
        post.return_value.status_code = 200
        post.return_value.content = b'<ok/>'
        post.return_value.raise_for_status.return_value = None
        pohoda_client._post(b'<x/>')

    expected = 'Basic ' + base64.b64encode(b'user:pass').decode('ascii')
    assert post.call_args.kwargs['headers']['STW-Authorization'] == expected


def test_build_print_request_and_parse_pdf_roundtrip():
    pdf_bytes = b'%PDF-1.4 fake pdf content'
    xml_bytes = build_print_request_xml('42', '190')
    assert b'<prn:id>42</prn:id>' in xml_bytes
    assert b'<prn:id>190</prn:id>' in xml_bytes

    response = (
        b'<?xml version="1.0" encoding="utf-8"?>'
        b'<rsp:responsePack xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd" '
        b'xmlns:prn="http://www.stormware.cz/schema/version_2/print.xsd" id="abc" state="ok">'
        b'<rsp:responsePackItem state="ok"><prn:binaryData>'
        + base64.b64encode(pdf_bytes) +
        b'</prn:binaryData></rsp:responsePackItem></rsp:responsePack>'
    )

    assert parse_print_response(response) == pdf_bytes


def test_parse_print_response_without_binary_data_raises_protocol_error():
    with pytest.raises(PohodaProtocolError):
        parse_print_response(b'<rsp:responsePack xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd"/>')
