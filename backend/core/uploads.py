"""Shared file-upload helpers for customer design uploads (orders app) and
motif photos (catalog admin, task 9) - content sniffing by magic bytes (never
trust the extension), SVG sanitising, and random-name storage.
"""
import uuid
from xml.etree.ElementTree import ParseError, tostring

from defusedxml import DefusedXmlException
from defusedxml.ElementTree import fromstring as defused_fromstring
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.translation import gettext as _

from .exceptions import UnsupportedFileTypeError

PNG = 'png'
JPG = 'jpg'
SVG = 'svg'
PDF = 'pdf'
WEBP = 'webp'

MIME_BY_KIND = {
    PNG: 'image/png',
    JPG: 'image/jpeg',
    SVG: 'image/svg+xml',
    PDF: 'application/pdf',
    WEBP: 'image/webp',
}

_SVG_SNIFF_WINDOW = 1024


def detect_kind(data):
    """Identify a file by its content, not its extension/declared MIME
    type - an uploaded "design.png" that isn't really a PNG must be rejected.
    """
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return PNG
    if data.startswith(b'\xff\xd8\xff'):
        return JPG
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return WEBP
    if data.startswith(b'%PDF'):
        return PDF
    head = data[:_SVG_SNIFF_WINDOW].lstrip()
    if head.startswith(b'<?xml') or head.startswith(b'<svg'):
        if b'<svg' in data[:_SVG_SNIFF_WINDOW].lower():
            return SVG
    return None


# Allowlist, not a denylist - SVG is XML, and a regex/string-pattern denylist
# (the previous approach) is trivially bypassed by unquoted on* attributes,
# javascript:/data: URIs the regex doesn't target, or <style>@import>. This
# parses the file structurally (defusedxml guards against XXE/entity-bomb
# attacks during parsing) and rebuilds it keeping only elements/attributes
# known to be safe for a print-design shape file - nothing resembling
# script/style/foreignObject/animation or event handlers survives, because
# they're simply never on the allowlist rather than pattern-matched away.
_ALLOWED_TAGS = {
    'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc',
    'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'stop',
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'textPath',
}

_ALLOWED_ATTRS = {
    'id', 'class', 'style', 'transform', 'viewBox', 'preserveAspectRatio',
    'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'd',
    'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity', 'opacity',
    'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod',
    'patternUnits', 'patternContentUnits', 'patternTransform',
    'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
    'letter-spacing', 'clip-path', 'mask', 'version', 'xmlns',
}

# CSS-level javascript: tricks (old-IE `url(javascript:...)`/behavior) land
# in `style` the same way they would in href - checked on every kept
# attribute value, not just href, since style is on the allowlist above.
_DANGEROUS_VALUE_SUBSTRINGS = ('javascript:', 'vbscript:', 'data:text/html')


def _local_name(tag):
    return tag.rsplit('}', 1)[-1]


def _is_safe_reference(value):
    # Only same-document fragment references (#someId) are kept - external
    # hrefs (http(s), data:, javascript:, relative paths) are dropped
    # outright rather than "blocked" in place, since none are needed for a
    # self-contained print-design file.
    return value.strip().startswith('#')


def _strip_unsafe_attributes(element):
    for attr_name in list(element.attrib):
        local = _local_name(attr_name)
        value = element.attrib[attr_name]
        if local.lower().startswith('on'):
            del element.attrib[attr_name]
        elif local == 'href':
            if not _is_safe_reference(value):
                del element.attrib[attr_name]
        elif local not in _ALLOWED_ATTRS:
            del element.attrib[attr_name]
        elif any(needle in value.lower() for needle in _DANGEROUS_VALUE_SUBSTRINGS):
            del element.attrib[attr_name]


def _sanitize_element(element):
    _strip_unsafe_attributes(element)
    for child in list(element):
        if _local_name(child.tag) not in _ALLOWED_TAGS:
            element.remove(child)
        else:
            _sanitize_element(child)


def sanitize_svg(data):
    """Parse-and-rebuild sanitizer (see _ALLOWED_TAGS/_ALLOWED_ATTRS above) -
    SVGs are customer-uploaded and get rendered back in the admin, so
    they're treated as untrusted content, same as any user HTML upload.
    """
    try:
        root = defused_fromstring(data)
    except (DefusedXmlException, ParseError, ValueError):
        raise UnsupportedFileTypeError(_('The uploaded SVG file could not be parsed.'))

    if _local_name(root.tag) != 'svg':
        raise UnsupportedFileTypeError(_('The uploaded SVG file could not be parsed.'))

    _sanitize_element(root)
    return tostring(root, encoding='utf-8')


def get_image_dimensions(data, kind):
    if kind not in (PNG, JPG, WEBP):
        return None, None
    try:
        from PIL import Image
        from io import BytesIO
        with Image.open(BytesIO(data)) as image:
            dimensions = image.width, image.height
            image.verify()
            with Image.open(BytesIO(data)) as decoded:
                decoded.load()
            return dimensions
    except Exception:
        return None, None


def save_random_file(data, directory, kind):
    """Stores `data` under `directory` with a random UUID name - uploaded
    file names are never trusted/kept, only the content-sniffed extension is.
    """
    extension = kind
    name = f'{directory}/{uuid.uuid4().hex}.{extension}'
    path = default_storage.save(name, ContentFile(data))
    return path, default_storage.url(path)


def design_upload_directory():
    now = timezone.now()
    return f'designs/{now.year:04d}/{now.month:02d}'
