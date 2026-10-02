import { afterEach, describe, expect, it } from 'vitest';
import { arcConfig, currentNetwork } from './config';

const MEMO = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505';
const USDC = '0x3600000000000000000000000000000000000000';

describe('arcConfig', () => {
  it('uses chain 5042 on mainnet and 5042002 on testnet', () => {
    expect(arcConfig('mainnet').chainId).toBe(5042);
    expect(arcConfig('testnet').chainId).toBe(5042002);
  });

  it('uses the network-specific EURC address', () => {
    expect(arcConfig('mainnet').tokens.EURC).toBe('0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1');
    expect(arcConfig('testnet').tokens.EURC).toBe('0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a');
  });

  it('uses the same USDC and Memo addresses on both networks', () => {
    for (const n of ['mainnet', 'testnet'] as const) {
      expect(arcConfig(n).memo).toBe(MEMO);
      expect(arcConfig(n).tokens.USDC).toBe(USDC);
    }
  });
});

describe('currentNetwork', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('throws on a misspelled network', () => {
    process.env.ARC_NETWORK = 'mainnnet';
    expect(() => currentNetwork()).toThrow();
  });

  it('defaults to testnet when unset', () => {
    delete process.env.ARC_NETWORK;
    delete process.env.NEXT_PUBLIC_ARC_NETWORK;
    expect(currentNetwork()).toBe('testnet');
  });
});
