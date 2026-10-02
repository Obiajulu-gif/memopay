import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keccak256, type PublicClient } from 'viem';
import { makeReceipt, memoLog } from '@/lib/arc/fixtures';
import { memoIdFor, transferCallData } from '@/lib/arc/encode';
import { arcConfig } from '@/lib/arc/config';
import type { Invoice } from '@/lib/db/invoices';

const recordVerification = vi.fn(async (_inv: unknown, _tx: string, r: { ok: boolean }) => (r.ok ? 'paid' : 'ignored'));
vi.mock('./record', () => ({ recordVerification }));
const { checkTx } = await import('./check');

const cfg = arcConfig('testnet');
const M = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const FROM = '0x9999999999999999999999999999999999999999';
const invoice = { id: 'inv-1', merchant: M, currency: 'USDC', amount: 50_000n, memo_id: memoIdFor('inv-1'), status: 'open', paid_tx: null } as unknown as Invoice;

const good = makeReceipt({
  logs: [memoLog({ emitter: cfg.memo, sender: FROM, target: cfg.tokens.USDC, callDataHash: keccak256(transferCallData(M, 50_000n)), memoId: invoice.memo_id as `0x${string}` })],
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
  });

  it('ignores a transaction without this invoice memo', async () => {
    const res = await checkTx(invoice, '0xaa', clientWith(async () => ({ ...makeReceipt({ logs: [] }), from: FROM })));
    expect(res).toEqual({ status: 'ignored', reason: 'no_memo' });
  });

  it('propagates RPC failures without recording anything', async () => {
    await expect(checkTx(invoice, '0xaa', clientWith(async () => { throw new Error('rpc down'); }))).rejects.toThrow('rpc down');
    expect(recordVerification).not.toHaveBeenCalled();
  });
});
