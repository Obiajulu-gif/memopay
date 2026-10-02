import { STORABLE_REASONS, type VerifyResult } from '@/lib/arc/verify';
import { getInvoice, markPaid, type Invoice, type InvoiceStatus } from '@/lib/db/invoices';
import { insertPayment } from '@/lib/db/payments';

export type RecordAction = { markPaid: boolean; payment: { matched: boolean; reason: string | null } | null };
export type RecordOutcome = 'paid' | 'already_paid' | 'mismatch' | 'ignored';

export function decideRecord(status: InvoiceStatus, paidTx: string | null, txHash: string, result: VerifyResult): RecordAction {
  if (!result.ok) {
    const storable = (STORABLE_REASONS as readonly string[]).includes(result.reason);
    return { markPaid: false, payment: storable ? { matched: false, reason: result.reason } : null };
  }
  if (status === 'open') return { markPaid: true, payment: { matched: true, reason: null } };
  if (status === 'void') return { markPaid: false, payment: { matched: false, reason: 'invoice_void' } };
  if (paidTx?.toLowerCase() === txHash.toLowerCase()) return { markPaid: false, payment: null };
  return { markPaid: false, payment: { matched: false, reason: 'duplicate' } };
}

// Payer for a failed match: we only know it when verification succeeded, so fall back to "unknown".
export async function recordVerification(
  invoice: Invoice,
  txHash: string,
  result: VerifyResult,
  block: bigint,
  payer = result.ok ? result.payer : 'unknown',
): Promise<RecordOutcome> {
  const tx = txHash.toLowerCase();
  let action = decideRecord(invoice.status, invoice.paid_tx, tx, result);

  if (action.markPaid) {
    if (await markPaid(invoice.id, tx, payer)) {
      await insertPayment({ tx_hash: tx, invoice_id: invoice.id, payer, matched: true, reason: null, block });
      return 'paid';
    }
    // Lost a race with another claim: re-decide against the fresh row.
    const fresh = await getInvoice(invoice.id);
    action = decideRecord(fresh?.status ?? 'void', fresh?.paid_tx ?? null, tx, result);
  }

  if (!action.payment) return result.ok ? 'already_paid' : 'ignored';
  await insertPayment({ tx_hash: tx, invoice_id: invoice.id, payer, ...action.payment, block });
  return 'mismatch';
}
