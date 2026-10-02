import { describe, expect, it } from 'vitest';
import { getAddress, keccak256 } from 'viem';
import { verifyPayment, type Expected } from './verify';
import { memoLog, makeReceipt } from './fixtures';
import { memoIdFor, transferCallData } from './encode';
import { arcConfig } from './config';

const cfg = arcConfig('testnet');
const M = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const;
const OTHER = '0x2222222222222222222222222222222222222222' as const;
const PAYER = '0x9999999999999999999999999999999999999999' as const;
const X = memoIdFor('inv-1');

const expected: Expected = { memoId: X, token: cfg.tokens.USDC, merchant: M, amount: 50_000n, memoContract: cfg.memo };

function log(over: Partial<Parameters<typeof memoLog>[0]> = {}) {
  return memoLog({
    emitter: cfg.memo,
    sender: PAYER,
    target: cfg.tokens.USDC,
    callDataHash: keccak256(transferCallData(M, 50_000n)),
    memoId: X,
    ...over,
  });
}

describe('verifyPayment', () => {
  it('accepts a matching Memo event', () => {
    expect(verifyPayment(makeReceipt({ logs: [log()], block: 7n }), expected)).toEqual({ ok: true, payer: PAYER, block: 7n });
  });

  it('rejects a reverted transaction', () => {
    expect(verifyPayment(makeReceipt({ status: 'reverted', logs: [log()] }), expected)).toEqual({ ok: false, reason: 'tx_failed' });
  });

  it('reports no_memo when there are no logs', () => {
    expect(verifyPayment(makeReceipt({ logs: [] }), expected)).toEqual({ ok: false, reason: 'no_memo' });
  });

  it('ignores Memo-shaped logs from another emitter', () => {
    expect(verifyPayment(makeReceipt({ logs: [log({ emitter: OTHER })] }), expected)).toEqual({ ok: false, reason: 'no_memo' });
  });

  it('ignores Memo logs for another invoice', () => {
    expect(verifyPayment(makeReceipt({ logs: [log({ memoId: memoIdFor('inv-2') })] }), expected)).toEqual({ ok: false, reason: 'no_memo' });
  });

  it('rejects the wrong token', () => {
    expect(verifyPayment(makeReceipt({ logs: [log({ target: cfg.tokens.EURC })] }), expected)).toEqual({ ok: false, reason: 'wrong_token' });
  });

  it('rejects a different amount', () => {
    const r = makeReceipt({ logs: [log({ callDataHash: keccak256(transferCallData(M, 50_001n)) })] });
    expect(verifyPayment(r, expected)).toEqual({ ok: false, reason: 'wrong_amount_or_recipient' });
  });

  it('rejects a different recipient', () => {
    const r = makeReceipt({ logs: [log({ callDataHash: keccak256(transferCallData(OTHER, 50_000n)) })] });
    expect(verifyPayment(r, expected)).toEqual({ ok: false, reason: 'wrong_amount_or_recipient' });
  });

  it('matches regardless of address case', () => {
    const checksummed = { ...expected, merchant: getAddress(M), token: cfg.tokens.USDC.toLowerCase() as `0x${string}`, memoContract: cfg.memo.toLowerCase() as `0x${string}` };
    expect(verifyPayment(makeReceipt({ logs: [log()] }), checksummed).ok).toBe(true);
    const lowerLog = log({ emitter: cfg.memo.toLowerCase() as `0x${string}` });
    expect(verifyPayment(makeReceipt({ logs: [lowerLog] }), expected).ok).toBe(true);
  });

  it('skips unrelated logs from the Memo contract', () => {
    const junk = { address: cfg.memo, topics: ['0x' + '00'.repeat(32)], data: '0x' } as never;
    expect(verifyPayment(makeReceipt({ logs: [junk, log()] }), expected).ok).toBe(true);
  });
});
