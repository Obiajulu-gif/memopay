import { describe, expect, it } from 'vitest';
import { decodeFunctionData, erc20Abi, hexToString, keccak256, toBytes } from 'viem';
import { canonicalJson, contentHash, memoCallArgs, memoDataFor, memoIdFor, transferCallData, type InvoiceContent } from './encode';

const M = '0x1111111111111111111111111111111111111111';
const ID = '0b5c2f1e-7d3a-4c2b-9f10-2a6b8e4d1c33';

const content: InvoiceContent = {
  number: 'INV-0001',
  merchant: M,
  client_name: 'Ada',
  currency: 'USDC',
  amount: 3_250_000n,
  line_items: [{ description: 'Logo', quantity: 2, unit_amount: 1_500_000n }],
  due_date: null,
};

describe('canonicalJson', () => {
  it('sorts keys recursively without whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('serializes bigint as a decimal string', () => {
    expect(canonicalJson({ a: 10n })).toBe('{"a":"10"}');
  });
});

describe('contentHash', () => {
  it('ignores key insertion order', () => {
    const reordered = { due_date: null, line_items: content.line_items, amount: content.amount, currency: content.currency, client_name: 'Ada', merchant: M, number: 'INV-0001' } as InvoiceContent;
    expect(contentHash(reordered)).toBe(contentHash(content));
  });

  it('changes when amount changes by one unit', () => {
    expect(contentHash({ ...content, amount: 3_250_001n })).not.toBe(contentHash(content));
  });
});

describe('memo encoding', () => {
  it('derives memoId from the invoice id', () => {
    expect(memoIdFor(ID)).toBe(keccak256(toBytes(`memopay:v1:${ID}`)));
  });

  it('encodes memoData as readable utf8', () => {
    expect(hexToString(memoDataFor('INV-0001', '0xab'))).toBe('memopay:v1:INV-0001:0xab');
  });

  it('builds ERC-20 transfer calldata', () => {
    const d = decodeFunctionData({ abi: erc20Abi, data: transferCallData(M, 50_000n) });
    expect(d.functionName).toBe('transfer');
    expect(d.args).toEqual([M, 50_000n]);
  });

  it('builds memo call args in contract order', () => {
    const token = '0x3600000000000000000000000000000000000000';
    const args = memoCallArgs({ id: ID, number: 'INV-0001', content_hash: '0xab', merchant: M, amount: 50_000n }, token);
    expect(args).toEqual([token, transferCallData(M, 50_000n), memoIdFor(ID), memoDataFor('INV-0001', '0xab')]);
  });
});
