import type { PublicClient } from 'viem';
import { arcConfig, currentNetwork, type Hex } from '@/lib/arc/config';
import { verifySettlement } from '@/lib/arc/verify';
import type { Invoice } from '@/lib/db/invoices';
import { recordVerification, type RecordOutcome } from './record';

export type CheckResult = { status: RecordOutcome; reason?: string };

// Throws on RPC failure; callers map that to 503 and nothing is recorded.
export async function checkTx(invoice: Invoice, txHash: string, client: PublicClient): Promise<CheckResult> {
  const network = currentNetwork();
  // A deployment only settles invoices created for its own Arc network (testnet USDC must never pay a mainnet invoice).
  if (invoice.network !== network) return { status: 'ignored', reason: 'wrong_network' };
  // Invoices from before the settlement contract carry no merchant signature and can't be settled.
  if (!invoice.settlement) return { status: 'ignored', reason: 'legacy_invoice' };
  const cfg = arcConfig(network);
  const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
  const result = verifySettlement(receipt, {
    settlement: invoice.settlement as Hex,
    id: invoice.memo_id as Hex,
    merchant: invoice.merchant as Hex,
    token: cfg.tokens[invoice.currency],
    amount: invoice.amount,
    contentHash: invoice.content_hash as Hex,
  });
  // Payer comes from the verified event (the authorization signer); for non-payments it's unknown.
  const status = await recordVerification(invoice, txHash, result, receipt.blockNumber);
  return result.ok ? { status } : { status, reason: result.reason };
}
