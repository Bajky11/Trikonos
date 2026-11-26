import logging

from django.conf import settings
from django.core.management.base import BaseCommand

from orders import pohoda
from orders.models import PohodaInvoice

logger = logging.getLogger(__name__)

BATCH_SIZE = 20


class Command(BaseCommand):
    help = (
        'Advances queued POHODA invoice requests: issues pending invoices, verifies '
        'ambiguous ones after a timeout, and delivers PDF+e-mail for issued ones. '
        'Intended to run every few minutes via cron (much more often than the daily '
        'cleanup_orphan_designs job - POHODA outages should resolve within minutes, '
        'not a day).'
    )

    def handle(self, *args, **options):
        if not settings.POHODA_ENABLED:
            self.stdout.write('POHODA integration disabled (POHODA_ENABLED is not true) - nothing to do.')
            return

        issued = pending = failed = 0
        issuance_rows = PohodaInvoice.objects.filter(
            status__in=[PohodaInvoice.Status.PENDING, PohodaInvoice.Status.REQUESTED],
        ).order_by('created_at')[:BATCH_SIZE]
        for row in issuance_rows:
            try:
                outcome = pohoda.process_issuance(row)
            except Exception:
                logger.exception(
                    'Unexpected error issuing PohodaInvoice %s (order %s)', row.id, row.order_number,
                )
                failed += 1
                continue
            if outcome == PohodaInvoice.Status.ISSUED:
                issued += 1
            elif outcome == PohodaInvoice.Status.FAILED:
                failed += 1
            elif outcome is not None:
                pending += 1

        sent = delivery_failed = delivery_pending = 0
        delivery_rows = PohodaInvoice.objects.filter(
            status=PohodaInvoice.Status.ISSUED,
        ).exclude(pdf_delivery_status=PohodaInvoice.PdfStatus.SENT).order_by('created_at')[:BATCH_SIZE]
        for row in delivery_rows:
            try:
                outcome = pohoda.process_pdf_delivery(row)
            except Exception:
                logger.exception(
                    'Unexpected error delivering PDF/e-mail for PohodaInvoice %s (order %s)', row.id, row.order_number,
                )
                delivery_failed += 1
                continue
            if outcome == PohodaInvoice.PdfStatus.SENT:
                sent += 1
            elif outcome == PohodaInvoice.PdfStatus.FAILED:
                delivery_failed += 1
            elif outcome is not None:
                delivery_pending += 1

        self.stdout.write(self.style.SUCCESS(
            f'Issuance: {issued} issued, {pending} still pending, {failed} failed. '
            f'PDF delivery: {sent} sent, {delivery_pending} still pending, {delivery_failed} failed.'
        ))
