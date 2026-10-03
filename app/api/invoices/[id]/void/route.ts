import { getMerchant, unauthorized } from '@/lib/auth/current';
import { publicClient, type Hex } from '@/lib/arc/config';
import { STATUS, settlementAbi } from '@/lib/arc/settlement';
import { getOwnedInvoice, voidInvoice } from '@/lib/db/invoices';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const merchant = await getMerchant();
  if (!merchant) return unauthorized();
  const { id } = await params;

  const inv = await getOwnedInvoice(id, merchant);
  if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });
  if (inv.status !== 'open') return Response.json({ error: 'Only open invoices can be voided' }, { status: 409 });

  // Settled invoices are cancelled on-chain by the merchant first; the contract is the source of truth.
  if (inv.settlement) {
    let status: number;
    try {
      status = Number(
        await publicClient().readContract({
          address: inv.settlement as Hex,
          abi: settlementAbi,
          functionName: 'statusOf',
          args: [inv.merchant as Hex, inv.memo_id as Hex],
        }),
      );
    } catch {
      return Response.json({ error: 'Network busy, try again' }, { status: 503 });
    }
    if (status === STATUS.Paid) return Response.json({ error: 'This invoice was already paid on Arc. Recheck the payment.' }, { status: 409 });
    if (status !== STATUS.Cancelled) return Response.json({ error: 'Cancel the invoice on Arc first' }, { status: 409 });
  }

  if (!(await voidInvoice(id, merchant))) return Response.json({ error: 'Only open invoices can be voided' }, { status: 409 });
  return Response.json({ status: 'void' });
}
