import { decodeEventLog, keccak256, type TransactionReceipt } from 'viem';
import { memoAbi } from './abi';
import { transferCallData } from './encode';
import type { Hex } from './config';

export type Expected = { memoId: Hex; token: Hex; merchant: Hex; amount: bigint; memoContract: Hex };

export type FailReason = 'tx_failed' | 'no_memo' | 'wrong_token' | 'wrong_amount_or_recipient';

export type VerifyResult =
  | { ok: true; payer: Hex; block: bigint }
  | { ok: false; reason: FailReason };

// Reasons that describe a real payment attempt against this invoice, so they are worth storing.
export const STORABLE_REASONS = ['wrong_token', 'wrong_amount_or_recipient'] as const;

const lc = (s: string) => s.toLowerCase();

export function verifyPayment(receipt: TransactionReceipt, expected: Expected): VerifyResult {
  if (receipt.status !== 'success') return { ok: false, reason: 'tx_failed' };

  const memo = receipt.logs
    .filter(l => lc(l.address) === lc(expected.memoContract))
    .map(l => {
      try {
        return decodeEventLog({ abi: memoAbi, eventName: 'Memo', topics: l.topics, data: l.data });
      } catch {
        return null;
      }
    })
    .find(e => e && lc(e.args.memoId) === lc(expected.memoId));

  if (!memo) return { ok: false, reason: 'no_memo' };
  if (lc(memo.args.target) !== lc(expected.token)) return { ok: false, reason: 'wrong_token' };

  const wantHash = keccak256(transferCallData(lc(expected.merchant) as Hex, expected.amount));
  if (lc(memo.args.callDataHash) !== wantHash) return { ok: false, reason: 'wrong_amount_or_recipient' };

  return { ok: true, payer: lc(memo.args.sender) as Hex, block: receipt.blockNumber };
}
