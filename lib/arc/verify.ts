import { decodeEventLog, type TransactionReceipt } from 'viem';
import { settlementAbi } from './settlement';
import type { Hex } from './config';

export type Expected = { settlement: Hex; id: Hex; merchant: Hex; token: Hex; amount: bigint; contentHash: Hex };

export type FailReason = 'tx_failed' | 'no_payment' | 'terms_mismatch';

export type VerifyResult =
  | { ok: true; payer: Hex; block: bigint }
  | { ok: false; reason: FailReason };

// Reasons that describe a real payment against this invoice, so they are worth storing.
export const STORABLE_REASONS = ['terms_mismatch'] as const;

const lc = (s: string) => s.toLowerCase();

/// The settlement contract only emits InvoicePaid after it has checked the merchant's signature and
/// moved exactly the signed amount to the merchant, so a matching event is proof of payment.
export function verifySettlement(receipt: TransactionReceipt, expected: Expected): VerifyResult {
  if (receipt.status !== 'success') return { ok: false, reason: 'tx_failed' };

  const paid = receipt.logs
    .filter(l => lc(l.address) === lc(expected.settlement))
    .map(l => {
      try {
        return decodeEventLog({ abi: settlementAbi, eventName: 'InvoicePaid', topics: l.topics, data: l.data });
      } catch {
        return null;
      }
    })
    .find(e => e && lc(e.args.id) === lc(expected.id) && lc(e.args.merchant) === lc(expected.merchant));

  if (!paid) return { ok: false, reason: 'no_payment' };
  const a = paid.args;
  if (lc(a.token) !== lc(expected.token) || a.amount !== expected.amount || lc(a.contentHash) !== lc(expected.contentHash)) {
    return { ok: false, reason: 'terms_mismatch' };
  }
  return { ok: true, payer: lc(a.payer) as Hex, block: receipt.blockNumber };
}
