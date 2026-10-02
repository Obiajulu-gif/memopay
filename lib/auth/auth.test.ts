import { beforeAll, describe, expect, it } from 'vitest';
import { verifyMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signInMessage } from './message';
import { readSession, signSession } from './session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
});

describe('signInMessage', () => {
  it('uses the exact sign-in format with a lowercase address', () => {
    expect(signInMessage('0xABC', 'n1')).toBe('MemoPay sign-in · 0xabc · n1');
  });
});

describe('session', () => {
  it('round-trips a lowercase address', async () => {
    expect(await readSession(await signSession('0xAbC'))).toBe('0xabc');
  });

  it('rejects garbage and missing tokens', async () => {
    expect(await readSession('garbage')).toBeNull();
    expect(await readSession(undefined)).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signSession('0xabc');
    process.env.SESSION_SECRET = 'another-secret-another-secret-another-1';
    expect(await readSession(token)).toBeNull();
    process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
  });
});

describe('wallet signature', () => {
  it('verifies only for the nonce that was signed', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signature = await account.signMessage({ message: signInMessage(account.address, 'n1') });
    expect(await verifyMessage({ address: account.address, message: signInMessage(account.address, 'n1'), signature })).toBe(true);
    expect(await verifyMessage({ address: account.address, message: signInMessage(account.address, 'n2'), signature })).toBe(false);
  });
});
