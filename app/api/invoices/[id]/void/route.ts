import { getMerchant, unauthorized } from '@/lib/auth/current';
import { getOwnedInvoice, voidInvoice } from '@/lib/db/invoices';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const merchant = await getMerchant();
  if (!merchant) return unauthorized();
  const { id } = await params;

  const inv = await getOwnedInvoice(id, merchant);
  if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });
  if (inv.status !== 'open' || !(await voidInvoice(id, merchant))) {
    return Response.json({ error: 'Only open invoices can be voided' }, { status: 409 });
  }
  return Response.json({ status: 'void' });
}
