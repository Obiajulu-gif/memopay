import { getMerchant, unauthorized } from '@/lib/auth/current';
import { listInvoices } from '@/lib/db/invoices';
import { invoicesToCsv } from '@/lib/invoices/csv';

export async function GET() {
  const merchant = await getMerchant();
  if (!merchant) return unauthorized();
  return new Response(invoicesToCsv(await listInvoices(merchant)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="memopay-invoices.csv"',
    },
  });
}
