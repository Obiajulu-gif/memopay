export function signInMessage(address: string, nonce: string): string {
  return `MemoPay sign-in · ${address.toLowerCase()} · ${nonce}`;
}
