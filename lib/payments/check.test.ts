import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keccak256, toBytes, type PublicClient } from 'viem';
import { makeReceipt, paidLog } from '@/lib/arc/fixtures';
import { memoIdFor } from '@/lib/arc/encode';
import { arcConfig } from '@/lib/arc/config';
import type { Invoice } from '@/lib/db/invoices';

const recordVerification = vi.fn(async (_inv: unknown, _tx: string, r: { ok: boolean }) => (r.ok ? 'paid' : 'ignored'));
vi.mock('./record', () => ({ recordVerification }));
const { checkTx } = await import('./check');

const cfg = arcConfig('testnet');
const M = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const FROM = '0x9999999999999999999999999999999999999999';
const SETTLEMENT = '0x5555555555555555555555555555555555555555';
const CONTENT = keccak256(toBytes('content'));
const invoice = { id: 'inv-1', merchant: M, currency: 'USDC', amount: 50_000n, memo_id: memoIdFor('inv-1'), content_hash: CONTENT, settlement: SETTLEMENT, status: 'open', paid_tx: null, network: 'testnet' } as unknown as Invoice;

const good = makeReceipt({
  logs: [paidLog({ emitter: SETTLEMENT, id: invoice.memo_id as `0x${string}`, merchant: M, payer: FROM, token: cfg.tokens.USDC, amount: 50_000n, contentHash: CONTENT })],
});
const clientWith = (getTransactionReceipt: () => Promise<unknown>) => ({ getTransactionReceipt }) as unknown as PublicClient;

beforeEach(() => {
  recordVerification.mockClear();
  process.env.ARC_NETWORK = 'testnet';
});

describe('checkTx', () => {
  it('records a valid payment as paid', async () => {
    const res = await checkTx(invoice, '0xaa', clientWith(async () => ({ ...good, from: FROM })));
    expect(res).toEqual({ status: 'paid' });
    expect(recordVerification).toHaveBeenCalledOnce();
    // The payer is the authorization signer from the event, never the tx sender (a relayer could differ).
    const call = recordVerification.mock.calls[0] as unknown[];
    expect(call[4]).toBeUndefined();
    expect((call[2] as { payer: string }).payer).toBe(FROM.toLowerCase());
  });

  it('ignores a transaction that did not pay this invoice', async () => {
    const res = await checkTx(invoice, '0xaa', clientWith(async () => ({ ...makeReceipt({ logs: [] }), from: FROM })));
    expect(res).toEqual({ status: 'ignored', reason: 'no_payment' });
  });

  it('refuses invoices created before the settlement contract without touching the chain', async () => {
    const getTransactionReceipt = vi.fn(async () => ({ ...good, from: FROM }));
    const res = await checkTx({ ...invoice, settlement: null } as Invoice, '0xaa', { getTransactionReceipt } as unknown as PublicClient);
    expect(res).toEqual({ status: 'ignored', reason: 'legacy_invoice' });
    expect(getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('refuses invoices from another Arc network without touching the chain', async () => {
    const getTransactionReceipt = vi.fn(async () => ({ ...good, from: FROM }));
    const res = await checkTx({ ...invoice, network: 'mainnet' } as Invoice, '0xaa', { getTransactionReceipt } as unknown as PublicClient);
    expect(res).toEqual({ status: 'ignored', reason: 'wrong_network' });
    expect(getTransactionReceipt).not.toHaveBeenCalled();
    expect(recordVerification).not.toHaveBeenCalled();
  });

  it('propagates RPC failures without recording anything', async () => {
    await expect(checkTx(invoice, '0xaa', clientWith(async () => { throw new Error('rpc down'); }))).rejects.toThrow('rpc down');
    expect(recordVerification).not.toHaveBeenCalled();
  });
});
