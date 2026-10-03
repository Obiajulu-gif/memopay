import { describe, expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { buildInvoice, checkMerchantSig } from './build';
import { invoiceTypedData } from '@/lib/arc/settlement';
import { contentHash, memoIdFor } from '@/lib/arc/encode';
import { arcConfig } from '@/lib/arc/config';

const SETTLEMENT = '0x5555555555555555555555555555555555555555' as const;
const ID = '0b5c2f1e-7d3a-4c2b-9f10-2a6b8e4d1c33';
const input = {
  client_name: 'Ada',
  currency: 'USDC' as const,
  due_date: null,
  line_items: [{ description: 'Logo', quantity: 2, unit_amount: 1_500_000n }],
  amount: 3_000_000n,
};

describe('buildInvoice', () => {
  it('derives memo id, content hash and settlement terms from the input', () => {
    const merchant = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const b = buildInvoice(input, merchant, ID, 'INV-0001', 'testnet');
    expect(b.memoId).toBe(memoIdFor(ID));
    expect(b.contentHash).toBe(contentHash({ number: 'INV-0001', merchant, ...input }));
    expect(b.terms).toEqual({ id: memoIdFor(ID), merchant, token: arcConfig('testnet').tokens.USDC, amount: 3_000_000n, contentHash: b.contentHash });
  });
});

describe('checkMerchantSig', () => {
  it('accepts the signed-in merchant signing these exact terms', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const merchant = acct.address.toLowerCase();
    const { terms } = buildInvoice(input, merchant, ID, 'INV-0001', 'testnet');
    const sig = await acct.signTypedData(invoiceTypedData(SETTLEMENT, 5042002, terms));
    expect(await checkMerchantSig(SETTLEMENT, 5042002, terms, sig)).toBe(true);
  });

  it('rejects a signature over different terms or another chain', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const merchant = acct.address.toLowerCase();
    const { terms } = buildInvoice(input, merchant, ID, 'INV-0001', 'testnet');
    const sig = await acct.signTypedData(invoiceTypedData(SETTLEMENT, 5042002, terms));
    expect(await checkMerchantSig(SETTLEMENT, 5042002, { ...terms, amount: 1n }, sig)).toBe(false);
    expect(await checkMerchantSig(SETTLEMENT, 5042, terms, sig)).toBe(false);
  });

  it('rejects a signature from another wallet and garbage', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const other = privateKeyToAccount(generatePrivateKey());
    const { terms } = buildInvoice(input, acct.address.toLowerCase(), ID, 'INV-0001', 'testnet');
    const sig = await other.signTypedData(invoiceTypedData(SETTLEMENT, 5042002, terms));
    expect(await checkMerchantSig(SETTLEMENT, 5042002, terms, sig)).toBe(false);
    expect(await checkMerchantSig(SETTLEMENT, 5042002, terms, '0x1234')).toBe(false);
  });
});
