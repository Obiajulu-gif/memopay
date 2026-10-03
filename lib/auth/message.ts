import { getAddress, isHex, verifyMessage } from 'viem';
import { createSiweMessage, parseSiweMessage, validateSiweMessage } from 'viem/siwe';

export type SignInFields = { address: string; nonce: string; domain: string; uri: string; chainId: number; issuedAt?: Date };

// EIP-4361 (Sign-In with Ethereum): wallets show the domain and warn when it doesn't match the site.
export function signInMessage(f: SignInFields): string {
  return createSiweMessage({
    address: getAddress(f.address),
    nonce: f.nonce,
    domain: f.domain,
    uri: f.uri,
    chainId: f.chainId,
    version: '1',
    statement: 'Sign in to MemoPay. This costs nothing and sends no transaction.',
    issuedAt: f.issuedAt ?? new Date(),
  });
}

// Returns the signer (lowercase) and nonce when the message is for this domain and the signature matches.
export async function checkSignIn(message: string, signature: string, domain: string): Promise<{ address: string; nonce: string } | null> {
  try {
    const parsed = parseSiweMessage(message);
    if (!parsed.address || !parsed.nonce || !isHex(signature)) return null;
    if (!validateSiweMessage({ message: parsed, domain })) return null;
    const ok = await verifyMessage({ address: parsed.address, message, signature });
    return ok ? { address: parsed.address.toLowerCase(), nonce: parsed.nonce } : null;
  } catch {
    return null;
  }
}
