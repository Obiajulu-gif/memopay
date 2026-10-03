import { describe, expect, it } from 'vitest';
import { getAddress, keccak256, toBytes } from 'viem';
import { verifySettlement, type Expected } from './verify';
import { makeReceipt, paidLog } from './fixtures';
import { memoIdFor } from './encode';
import { arcConfig } from './config';

const cfg = arcConfig('testnet');
const SETTLEMENT = '0x5555555555555555555555555555555555555555' as const;
const M = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const;
const PAYER = '0x9999999999999999999999999999999999999999' as const;
const ID = memoIdFor('inv-1');
const CONTENT = keccak256(toBytes('content'));

const expected: Expected = { settlement: SETTLEMENT, id: ID, merchant: M, token: cfg.tokens.USDC, amount: 50_000n, contentHash: CONTENT };

function log(over: Partial<Parameters<typeof paidLog>[0]> = {}) {
  return paidLog({ emitter: SETTLEMENT, id: ID, merchant: M, payer: PAYER, token: cfg.tokens.USDC, amount: 50_000n, contentHash: CONTENT, ...over });
}

describe('verifySettlement', () => {
  it('accepts a matching InvoicePaid event', () => {
    expect(verifySettlement(makeReceipt({ logs: [log()], block: 7n }), expected)).toEqual({ ok: true, payer: PAYER, block: 7n });
  });

  it('rejects a reverted transaction', () => {
    expect(verifySettlement(makeReceipt({ status: 'reverted', logs: [log()] }), expected)).toEqual({ ok: false, reason: 'tx_failed' });
  });

  it('reports no_payment when the settlement contract emitted nothing for this invoice', () => {
    expect(verifySettlement(makeReceipt({ logs: [] }), expected)).toEqual({ ok: false, reason: 'no_payment' });
    expect(verifySettlement(makeReceipt({ logs: [log({ id: memoIdFor('inv-2') })] }), expected)).toEqual({ ok: false, reason: 'no_payment' });
  });

  it('ignores InvoicePaid events from any other contract', () => {
    expect(verifySettlement(makeReceipt({ logs: [log({ emitter: '0x6666666666666666666666666666666666666666' })] }), expected)).toEqual({ ok: false, reason: 'no_payment' });
  });

  it('ignores a payment for the same id under another merchant', () => {
    expect(verifySettlement(makeReceipt({ logs: [log({ merchant: '0x2222222222222222222222222222222222222222' })] }), expected)).toEqual({ ok: false, reason: 'no_payment' });
  });

  it('flags terms that differ from the stored invoice', () => {
    expect(verifySettlement(makeReceipt({ logs: [log({ amount: 1n })] }), expected)).toEqual({ ok: false, reason: 'terms_mismatch' });
    expect(verifySettlement(makeReceipt({ logs: [log({ token: cfg.tokens.EURC })] }), expected)).toEqual({ ok: false, reason: 'terms_mismatch' });
    expect(verifySettlement(makeReceipt({ logs: [log({ contentHash: keccak256(toBytes('other')) })] }), expected)).toEqual({ ok: false, reason: 'terms_mismatch' });
  });

  it('matches regardless of address case', () => {
    const mixed = { ...expected, merchant: getAddress(M), settlement: SETTLEMENT.toLowerCase() as `0x${string}` };
    expect(verifySettlement(makeReceipt({ logs: [log()] }), mixed).ok).toBe(true);
  });

  it('skips unrelated logs from the settlement contract', () => {
    const junk = { address: SETTLEMENT, topics: ['0x' + '00'.repeat(32)], data: '0x' } as never;
    expect(verifySettlement(makeReceipt({ logs: [junk, log()] }), expected).ok).toBe(true);
  });
});
