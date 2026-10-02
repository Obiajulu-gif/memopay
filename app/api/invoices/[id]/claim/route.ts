import { publicClient } from '@/lib/arc/config';
import { getInvoice } from '@/lib/db/invoices';
import { checkTx } from '@/lib/payments/check';
import { clientIp, rateLimit } from '@/lib/ratelimit';

const TX_RE = /^0x[0-9a-fA-F]{64}$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`claim:${clientIp(req)}`)) return Response.json({ error: 'Too many requests' }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { txHash?: unknown } | null;
  const txHash = typeof body?.txHash === 'string' ? body.txHash : '';
  if (!TX_RE.test(txHash)) return Response.json({ error: 'Invalid transaction hash' }, { status: 400 });

  const { id } = await params;
  const invoice = await getInvoice(id).catch(() => null);
  if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

  try {
    return Response.json(await checkTx(invoice, txHash, publicClient()));
  } catch (e) {
    const isRpc = !(e as { code?: string }).code; // postgres errors carry a SQLSTATE code
    return isRpc
      ? Response.json({ error: 'Network busy, try again', txHash }, { status: 503 })
      : Response.json({ error: 'Could not save payment, try again', txHash }, { status: 500 });
  }
}
