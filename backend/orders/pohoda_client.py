"""Low-level POHODA mServer XML/HTTP plumbing - no Django ORM calls here, so
this module is easy to unit test by mocking `requests`. Orchestration (what
to do with the result, retries, DB bookkeeping) lives in `orders.pohoda`.

XML field names below follow POHODA's publicly documented XML schemas
(invoice.xsd/type.xsd/data.xsd/list.xsd/filter.xsd/print.xsd/response.xsd)
and established third-party integrations, but have NOT been verified
against this client's actual POHODA installation/version - see the "Rizika"
section of the implementation plan. `parse_invoice_response` and
`parse_print_response` raise `PohodaProtocolError` rather than silently
misinterpreting an unexpected response shape, specifically so a schema
mismatch surfaces immediately in testing instead of corrupting invoice data.
"""
import base64
import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import NamedTuple, Optional
from xml.etree import ElementTree as ET
from xml.etree.ElementTree import ParseError

import requests
from defusedxml import DefusedXmlException
from defusedxml import ElementTree as defused_ET
from django.conf import settings

NS = {
    'dat': 'http://www.stormware.cz/schema/version_2/data.xsd',
    'inv': 'http://www.stormware.cz/schema/version_2/invoice.xsd',
    'typ': 'http://www.stormware.cz/schema/version_2/type.xsd',
    'lst': 'http://www.stormware.cz/schema/version_2/list.xsd',
    'flt': 'http://www.stormware.cz/schema/version_2/filter.xsd',
    'prn': 'http://www.stormware.cz/schema/version_2/print.xsd',
    'rsp': 'http://www.stormware.cz/schema/version_2/response.xsd',
}

# Without this, ET.tostring() would serialize `{uri}tag` elements with
# auto-generated ns0:/ns1:/... prefixes instead of the conventional
# dat:/inv:/prn:/... ones used throughout POHODA's own documentation and
# every third-party example - registering them once at import time keeps
# built XML readable and matches what POHODA itself emits.
for _prefix, _uri in NS.items():
    ET.register_namespace(_prefix, _uri)


class PohodaConnectionError(Exception):
    """Network/timeout talking to mServer - outcome is unknown/ambiguous,
    safe to retry (the request may or may not have been processed).
    """


class PohodaProtocolError(Exception):
    """mServer answered, but the response doesn't match the expected shape -
    treated as ambiguous rather than guessed at.
    """


class InvoiceResult(NamedTuple):
    outcome: str  # 'issued' | 'duplicate' | 'rejected'
    invoice_number: str
    internal_id: str
    error_code: str
    error_message: str


def _ns(prefix, tag):
    return f'{{{NS[prefix]}}}{tag}'


def _qn(element, prefix, tag, text=None, **attrib):
    child = ET.SubElement(element, _ns(prefix, tag), attrib)
    if text is not None:
        child.text = str(text)
    return child


def _tostring(root):
    return b"<?xml version='1.0' encoding='utf-8'?>\n" + ET.tostring(root, encoding='utf-8')


def _vat_breakdown(gross_amount):
    """Splits a gross (VAT-inclusive) amount in haléře into (net, vat) using
    the single flat POHODA_VAT_RATE_PERCENT configured for the whole shop -
    there is no per-item VAT rate anywhere in this system (see plan). net+vat
    always reconstructs exactly to gross_amount (vat is the remainder), so
    rounding never drifts the total.
    """
    rate = Decimal(settings.POHODA_VAT_RATE_PERCENT) / Decimal('100')
    gross = Decimal(gross_amount)
    net = int((gross / (Decimal('1') + rate)).to_integral_value(rounding=ROUND_HALF_UP))
    vat = int(gross) - net
    return net, vat


def _address_element(parent, tag, billing):
    address = _qn(parent, 'inv', tag)
    identity = _qn(address, 'typ', 'address')
    if billing.get('company_name'):
        _qn(identity, 'typ', 'company', billing['company_name'])
    _qn(identity, 'typ', 'name', billing.get('full_name', ''))
    if billing.get('ico'):
        _qn(identity, 'typ', 'ico', billing['ico'])
    if billing.get('dic'):
        _qn(identity, 'typ', 'dic', billing['dic'])
    _qn(identity, 'typ', 'street', billing.get('street', ''))
    _qn(identity, 'typ', 'city', billing.get('city', ''))
    _qn(identity, 'typ', 'zip', billing.get('zip', ''))
    _qn(identity, 'typ', 'country', billing.get('country', 'CZ'))
    return address


def build_invoice_xml(invoice):
    """`invoice` is a `PohodaInvoice` row - the XML is built entirely from
    its snapshot fields, never from the live Order, so a retry under the
    same request_id is byte-for-byte reproducible.
    """
    request_id = str(invoice.request_id)
    root = ET.Element(_ns('dat', 'dataPack'), {
        'id': request_id,
        'ico': settings.POHODA_ICO,
        'application': settings.POHODA_APPLICATION_NAME,
        'version': '2.0',
        'note': f'Trikonos e-shop, objednávka {invoice.order_number}',
    })
    item = _qn(root, 'dat', 'dataPackItem', id=request_id, version='2.0')
    inv = _qn(item, 'inv', 'invoice', version='2.0')

    header = _qn(inv, 'inv', 'invoiceHeader')
    _qn(header, 'inv', 'invoiceType', 'issuedInvoice')
    if settings.POHODA_NUMBERING_SERIES:
        number = _qn(header, 'inv', 'number')
        _qn(number, 'typ', 'numberingSeries', settings.POHODA_NUMBERING_SERIES)
    _qn(header, 'inv', 'symVar', invoice.order_number)
    _address_element(header, 'partnerIdentity', invoice.billing_snapshot)
    payment = _qn(header, 'inv', 'paymentType')
    _qn(payment, 'typ', 'paymentType', 'draft')
    _qn(header, 'inv', 'text', f'Objednávka {invoice.order_number}')
    if settings.POHODA_PRE_ACCOUNTING:
        accounting = _qn(header, 'inv', 'centre')
        _qn(accounting, 'typ', 'ids', settings.POHODA_PRE_ACCOUNTING)

    detail = _qn(inv, 'inv', 'invoiceDetail')
    net_total = 0
    vat_total = 0
    lines = list(invoice.items_snapshot)
    if invoice.shipping_cost_amount:
        lines = lines + [{'label': 'Doprava', 'unit_price': invoice.shipping_cost_amount, 'quantity': 1}]
    for line in lines:
        gross_line = line['unit_price'] * line['quantity']
        net_line, vat_line = _vat_breakdown(gross_line)
        net_total += net_line
        vat_total += vat_line
        line_item = _qn(detail, 'inv', 'invoiceItem')
        _qn(line_item, 'inv', 'text', line['label'])
        _qn(line_item, 'inv', 'quantity', line['quantity'])
        _qn(line_item, 'inv', 'unit', 'ks')
        _qn(line_item, 'inv', 'payVAT', 'true')
        _qn(line_item, 'inv', 'rateVAT', settings.POHODA_VAT_RATE_CODE)
        home_currency = _qn(line_item, 'inv', 'homeCurrency')
        unit_net = Decimal(net_line) / Decimal(line['quantity']) if line['quantity'] else Decimal('0')
        _qn(home_currency, 'typ', 'unitPrice', _haler_to_czk(unit_net))
        _qn(home_currency, 'typ', 'price', _haler_to_czk(net_line))
        _qn(home_currency, 'typ', 'priceVAT', _haler_to_czk(vat_line))
        if settings.POHODA_VAT_CLASSIFICATION:
            classification = _qn(line_item, 'inv', 'classificationVAT')
            _qn(classification, 'typ', 'ids', settings.POHODA_VAT_CLASSIFICATION)

    summary = _qn(inv, 'inv', 'invoiceSummary')
    _qn(summary, 'inv', 'roundingDocument', 'math2one')
    summary_currency = _qn(summary, 'inv', 'homeCurrency')
    _qn(summary_currency, 'typ', 'priceNone', '0')
    _qn(summary_currency, 'typ', 'priceLow', '0')
    _qn(summary_currency, 'typ', 'priceLowVAT', '0')
    _qn(summary_currency, 'typ', 'priceHigh', _haler_to_czk(net_total))
    _qn(summary_currency, 'typ', 'priceHighVAT', _haler_to_czk(vat_total))

    return _tostring(root)


def _haler_to_czk(amount):
    """Haléře (int) -> CZK decimal string with 2 places, as POHODA expects
    plain currency amounts (not the smallest-unit integers this shop stores).
    """
    return str((Decimal(amount) / Decimal('100')).quantize(Decimal('0.01')))


def _find(element, path):
    return element.find(path, NS)


def parse_invoice_response(xml_bytes):
    try:
        root = defused_ET.fromstring(xml_bytes)
    except (DefusedXmlException, ParseError, ValueError) as exc:
        raise PohodaProtocolError(f'Unparseable response: {exc}') from exc

    item = _find(root, 'rsp:responsePackItem')
    if item is None:
        raise PohodaProtocolError('Response has no rsp:responsePackItem.')

    state = item.get('state')
    if state is None:
        raise PohodaProtocolError('rsp:responsePackItem has no state attribute.')

    if state == 'ok':
        produced = _find(item, 'rsp:producedDetails')
        internal_id = produced.get('id') if produced is not None else ''
        number_element = _find(item, './/inv:number/typ:ids') if produced is None else _find(produced, 'inv:number/typ:ids')
        invoice_number = number_element.text if number_element is not None else ''
        return InvoiceResult('issued', invoice_number or '', internal_id or '', '', '')

    detail = _find(item, 'rsp:detail')
    error_code = detail.get('code', '') if detail is not None else ''
    note_element = _find(item, 'rsp:note')
    error_message = note_element.text if note_element is not None else (item.get('note') or '')

    if 'duplicit' in (error_message or '').lower():
        return InvoiceResult('duplicate', '', '', error_code, error_message or '')

    return InvoiceResult('rejected', '', '', error_code, error_message or 'POHODA rejected the invoice import.')


def build_list_query_xml(order_number):
    request_id = str(uuid.uuid4())
    root = ET.Element(_ns('dat', 'dataPack'), {
        'id': request_id, 'ico': settings.POHODA_ICO,
        'application': settings.POHODA_APPLICATION_NAME, 'version': '2.0',
    })
    item = _qn(root, 'dat', 'dataPackItem', id=request_id, version='2.0')
    request = _qn(item, 'lst', 'listInvoiceRequest', version='2.0', invoiceType='issuedInvoice')
    request_header = _qn(request, 'lst', 'requestHeader')
    filter_element = _qn(request_header, 'lst', 'filter')
    _qn(filter_element, 'flt', 'symVar', order_number)
    return _tostring(root)


def parse_list_response(xml_bytes):
    """Returns an `InvoiceResult` for the first matching invoice, or None if
    the query came back empty (genuinely not found, not an error).
    """
    try:
        root = defused_ET.fromstring(xml_bytes)
    except (DefusedXmlException, ParseError, ValueError) as exc:
        raise PohodaProtocolError(f'Unparseable list response: {exc}') from exc

    invoice = _find(root, './/inv:invoice')
    if invoice is None:
        return None

    number_element = _find(invoice, 'inv:invoiceHeader/inv:number/typ:ids')
    internal_id = invoice.get('id', '')
    return InvoiceResult('issued', number_element.text if number_element is not None else '', internal_id, '', '')


def build_print_request_xml(record_id, report_id):
    request_id = str(uuid.uuid4())
    root = ET.Element(_ns('dat', 'dataPack'), {
        'id': request_id, 'ico': settings.POHODA_ICO,
        'application': settings.POHODA_APPLICATION_NAME, 'version': '2.0',
    })
    item = _qn(root, 'dat', 'dataPackItem', id=request_id, version='2.0')
    print_request = _qn(item, 'prn', 'printRequest', version='2.0')
    record = _qn(print_request, 'prn', 'record')
    _qn(record, 'prn', 'agenda', 'invoice')
    _qn(record, 'prn', 'id', record_id)
    report = _qn(print_request, 'prn', 'report')
    _qn(report, 'prn', 'id', report_id)
    pdf = _qn(print_request, 'prn', 'pdf')
    _qn(pdf, 'prn', 'binaryData', 'true')
    return _tostring(root)


def parse_print_response(xml_bytes):
    try:
        root = defused_ET.fromstring(xml_bytes)
    except (DefusedXmlException, ParseError, ValueError) as exc:
        raise PohodaProtocolError(f'Unparseable print response: {exc}') from exc

    binary_data = _find(root, './/prn:binaryData')
    if binary_data is None or not binary_data.text:
        raise PohodaProtocolError('Print response has no prn:binaryData.')
    try:
        return base64.b64decode(binary_data.text)
    except (ValueError, TypeError) as exc:
        raise PohodaProtocolError(f'prn:binaryData is not valid base64: {exc}') from exc


def _post(xml_bytes):
    credentials = f'{settings.POHODA_USERNAME}:{settings.POHODA_PASSWORD}'.encode('utf-8')
    headers = {
        'STW-Authorization': 'Basic ' + base64.b64encode(credentials).decode('ascii'),
        'Content-Type': 'application/xml',
    }
    try:
        response = requests.post(
            settings.POHODA_URL, data=xml_bytes, headers=headers,
            timeout=(settings.POHODA_CONNECT_TIMEOUT, settings.POHODA_READ_TIMEOUT),
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise PohodaConnectionError(str(exc)) from exc
    return response.content


def submit_invoice(invoice) -> InvoiceResult:
    return parse_invoice_response(_post(build_invoice_xml(invoice)))


def find_issued_invoice(order_number) -> Optional[InvoiceResult]:
    return parse_list_response(_post(build_list_query_xml(order_number)))


def fetch_invoice_pdf(record_id) -> bytes:
    return parse_print_response(_post(build_print_request_xml(record_id, settings.POHODA_PRINT_REPORT_ID)))
