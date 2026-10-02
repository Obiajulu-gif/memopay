import { db } from './client';

export type Payment = {
  tx_hash: string;
  invoice_id: string;
  payer: string;
  matched: boolean;
  reason: string | null;
  block: bigint;
  created_at: Date;
};

export async function insertPayment(p: Omit<Payment, 'created_at'>): Promise<void> {
  await db()`
    insert into payments (tx_hash, invoice_id, payer, matched, reason, block)
    values (${p.tx_hash}, ${p.invoice_id}, ${p.payer}, ${p.matched}, ${p.reason}, ${p.block.toString()})
    on conflict (tx_hash) do nothing`;
}

export async function listPayments(invoiceId: string): Promise<Payment[]> {
  const rows = await db()<Array<Omit<Payment, 'block'> & { block: string }>>`select * from payments where invoice_id = ${invoiceId} order by created_at`;
  return rows.map(r => ({ ...r, block: BigInt(r.block) }));
}
