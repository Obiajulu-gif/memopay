import { beforeAll, describe, expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { checkSignIn, signInMessage } from './message';
import { readSession, signSession } from './session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
});

const fields = (address: string, nonce = 'abcdef0123456789abcdef0123456789') => ({
  address,
  nonce,
  domain: 'memopay.example',
  uri: 'https://memopay.example',
  chainId: 5042002,
  issuedAt: new Date('2026-10-02T12:00:00Z'),
});

describe('signInMessage', () => {
  it('is an EIP-4361 message bound to the domain and nonce', () => {
    const m = signInMessage(fields('0x1111111111111111111111111111111111111111'));
    expect(m.startsWith('memopay.example wants you to sign in with your Ethereum account:')).toBe(true);
    expect(m).toContain('Nonce: abcdef0123456789abcdef0123456789');
    expect(m).toContain('URI: https://memopay.example');
  });
});

describe('checkSignIn', () => {
  it('accepts a valid signature for the expected domain', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const message = signInMessage(fields(acct.address));
    const signature = await acct.signMessage({ message });
    expect(await checkSignIn(message, signature, 'memopay.example')).toEqual({ address: acct.address.toLowerCase(), nonce: 'abcdef0123456789abcdef0123456789' });
  });

  it('rejects a message signed for another domain (phishing site)', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const message = signInMessage({ ...fields(acct.address), domain: 'evil.example', uri: 'https://evil.example' });
    const signature = await acct.signMessage({ message });
    expect(await checkSignIn(message, signature, 'memopay.example')).toBeNull();
  });

  it('rejects a signature from a different wallet', async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const other = privateKeyToAccount(generatePrivateKey());
    const message = signInMessage(fields(acct.address));
    expect(await checkSignIn(message, await other.signMessage({ message }), 'memopay.example')).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await checkSignIn('hello', '0x00', 'memopay.example')).toBeNull();
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
