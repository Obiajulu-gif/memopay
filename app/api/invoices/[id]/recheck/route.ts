import { getMerchant, unauthorized } from '@/lib/auth/current';
import { arcConfig, currentNetwork, publicClient, type Hex } from '@/lib/arc/config';
import { findMemoTxHashes } from '@/lib/arc/scan';
import { getOwnedInvoice } from '@/lib/db/invoices';
import { checkTx } from '@/lib/payments/check';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const merchant = await getMerchant();
  if (!merchant) return unauthorized();
  const { id } = await params;
  const invoice = await getOwnedInvoice(id, merchant);
  if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

  const client = publicClient();
  const chunk = BigInt(process.env.ARC_LOGS_CHUNK || '10000');
  try {
    const latest = await client.getBlockNumber();
    const hashes = await findMemoTxHashes(client, arcConfig(currentNetwork()).memo, invoice.memo_id as Hex, invoice.created_block, latest, chunk);
    for (const h of hashes) await checkTx(invoice, h, client);
    const fresh = await getOwnedInvoice(id, merchant);
    return Response.json({ found: hashes.length, status: fresh?.status ?? invoice.status });
  } catch {
    return Response.json({ error: 'Network busy, try again' }, { status: 503 });
  }
}
