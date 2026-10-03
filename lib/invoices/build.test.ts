import { describe, expect, it } from 'vitest';
import { parseSignature, serializeSignature } from 'viem';
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
    expect(await checkMerchantSig(SETTLEMENT, 5042002, terms, sig)).toBe(sig);
  });

  it('normalizes v = 0/1 signatures to 27/28 so the contract accepts them', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const { terms } = buildInvoice(input, acct.address.toLowerCase(), ID, 'INV-0001', 'testnet');
    const sig = await acct.signTypedData(invoiceTypedData(SETTLEMENT, 5042002, terms));
    const { r, s, yParity } = parseSignature(sig);
    const raw01 = `${r}${s.slice(2)}0${yParity}` as `0x${string}`; // v as 00/01, as some wallets return
    expect(await checkMerchantSig(SETTLEMENT, 5042002, terms, raw01)).toBe(serializeSignature({ r, s, v: BigInt(27 + yParity) }));
  });

  it('rejects high-s signatures the contract would refuse', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const { terms } = buildInvoice(input, acct.address.toLowerCase(), ID, 'INV-0001', 'testnet');
    const sig = await acct.signTypedData(invoiceTypedData(SETTLEMENT, 5042002, terms));
    const { r, s, yParity } = parseSignature(sig);
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const highS = `0x${(n - BigInt(s)).toString(16).padStart(64, '0')}` as `0x${string}`;
    const malleated = serializeSignature({ r, s: highS, v: BigInt(27 + (1 - yParity)) });
    expect(await checkMerchantSig(SETTLEMENT, 5042002, terms, malleated)).toBe(null);
  });

  it('rejects a signature over different terms or another chain', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const merchant = acct.address.toLowerCase();
    const { terms } = buildInvoice(input, merchant, ID, 'INV-0001', 'testnet');
    const sig = await acct.signTypedData(invoiceTypedData(SETTLEMENT, 5042002, terms));
    expect(await checkMerchantSig(SETTLEMENT, 5042002, { ...terms, amount: 1n }, sig)).toBe(null);
    expect(await checkMerchantSig(SETTLEMENT, 5042, terms, sig)).toBe(null);
  });

  it('rejects a signature from another wallet and garbage', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const other = privateKeyToAccount(generatePrivateKey());
    const { terms } = buildInvoice(input, acct.address.toLowerCase(), ID, 'INV-0001', 'testnet');
    const sig = await other.signTypedData(invoiceTypedData(SETTLEMENT, 5042002, terms));
    expect(await checkMerchantSig(SETTLEMENT, 5042002, terms, sig)).toBe(null);
    expect(await checkMerchantSig(SETTLEMENT, 5042002, terms, '0x1234')).toBe(null);
  });
});
