import { describe, expect, it } from 'vitest';
import { decodeFunctionData, hashTypedData, keccak256, recoverTypedDataAddress, toBytes } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { invoiceTypedData, payCallData, receiveAuthTypedData, settlementAbi, splitSig, type SettlementInvoice } from './settlement';

const CONTRACT = '0x1111111111111111111111111111111111111111';
const vector: SettlementInvoice = {
  id: keccak256(toBytes('memopay:v1:vector')),
  merchant: '0x2222222222222222222222222222222222222222',
  token: '0x3600000000000000000000000000000000000000',
  amount: 3_250_000n,
  contentHash: keccak256(toBytes('vector-content')),
};

describe('invoiceTypedData', () => {
  it('produces the same digest as MemoPayInvoices.hashInvoice (Solidity test vector)', () => {
    expect(hashTypedData(invoiceTypedData(CONTRACT, 5042, vector))).toBe(
      '0x749da5d5658292459a76186ac1fe86ac6c07fb6132724177491ebad47536c1ee',
    );
  });

  it('round-trips a merchant signature', async () => {
    const merchant = privateKeyToAccount(generatePrivateKey());
    const inv = { ...vector, merchant: merchant.address };
    const sig = await merchant.signTypedData(invoiceTypedData(CONTRACT, 5042, inv));
    expect(await recoverTypedDataAddress({ ...invoiceTypedData(CONTRACT, 5042, inv), signature: sig })).toBe(merchant.address);
  });
});

describe('receiveAuthTypedData', () => {
  it("uses the token's FiatToken v2 domain and pays the settlement contract", () => {
    const td = receiveAuthTypedData({
      token: vector.token,
      tokenName: 'USDC',
      chainId: 5042,
      from: '0x9999999999999999999999999999999999999999',
      to: CONTRACT,
      value: 3_250_000n,
      validBefore: 2_000_000_000n,
      nonce: `0x${'ab'.repeat(32)}`,
    });
    expect(td.domain).toEqual({ name: 'USDC', version: '2', chainId: 5042, verifyingContract: vector.token });
    expect(td.primaryType).toBe('ReceiveWithAuthorization');
    expect(td.message.to).toBe(CONTRACT);
    expect(td.message.validAfter).toBe(0n);
  });
});

describe('payCallData', () => {
  it('encodes pay(invoice, merchantSig, authorization)', () => {
    const sig = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as const;
    const data = payCallData(vector, sig, {
      from: '0x9999999999999999999999999999999999999999',
      value: 3_250_000n,
      validAfter: 0n,
      validBefore: 2_000_000_000n,
      nonce: `0x${'ab'.repeat(32)}`,
      signature: sig,
    });
    const d = decodeFunctionData({ abi: settlementAbi, data });
    expect(d.functionName).toBe('pay');
    const [inv, merchantSig, auth] = d.args as unknown as [SettlementInvoice, string, { v: number; r: string; s: string; value: bigint }];
    expect(inv.amount).toBe(3_250_000n);
    expect(merchantSig).toBe(sig);
    expect(auth).toMatchObject({ v: 27, r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}`, value: 3_250_000n });
  });
});

describe('splitSig', () => {
  it('normalizes v from 0/1 to 27/28', () => {
    expect(splitSig(`0x${'11'.repeat(32)}${'22'.repeat(32)}01`).v).toBe(28);
  });
});
