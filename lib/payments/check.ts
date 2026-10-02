import type { PublicClient } from 'viem';
import { arcConfig, currentNetwork, type Hex } from '@/lib/arc/config';
import { verifyPayment } from '@/lib/arc/verify';
import type { Invoice } from '@/lib/db/invoices';
import { recordVerification, type RecordOutcome } from './record';

export type CheckResult = { status: RecordOutcome; reason?: string };

// Throws on RPC failure; callers map that to 503 and nothing is recorded.
export async function checkTx(invoice: Invoice, txHash: string, client: PublicClient): Promise<CheckResult> {
  const cfg = arcConfig(currentNetwork());
  const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
  const result = verifyPayment(receipt, {
    memoId: invoice.memo_id as Hex,
    token: cfg.tokens[invoice.currency],
    merchant: invoice.merchant as Hex,
    amount: invoice.amount,
    memoContract: cfg.memo,
  });
  const status = await recordVerification(invoice, txHash, result, receipt.blockNumber, receipt.from.toLowerCase());
  return result.ok ? { status } : { status, reason: result.reason };
}
