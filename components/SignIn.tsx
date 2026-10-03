'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientNetwork, connectWallet, walletError } from '@/lib/arc/browser';
import { arcConfig } from '@/lib/arc/config';
import { signInMessage } from '@/lib/auth/message';

function useSignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const { wallet, address } = await connectWallet();
      const { nonce } = await fetch('/api/auth/nonce').then(r => r.json());
      const message = signInMessage({
        address,
        nonce,
        domain: window.location.host,
        uri: window.location.origin,
        chainId: arcConfig(clientNetwork()).chainId,
      });
      const signature = await wallet.signMessage({ account: address, message });
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Sign-in failed');
      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      setError(walletError(e));
      setBusy(false);
    }
  }

  return { busy, error, signIn };
}

export default function SignIn() {
  const { busy, error, signIn } = useSignIn();
  return (
    <div className="stack">
      <button className="btn btn-primary btn-lg" onClick={signIn} disabled={busy}>
        {busy ? 'Check your wallet…' : 'Connect wallet & sign in'}
      </button>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <p className="muted small">Signing a message proves you own the address. It costs nothing and sends no transaction.</p>
    </div>
  );
}

// Compact version for the header.
export function NavConnect() {
  const { busy, error, signIn } = useSignIn();
  return (
    <span className="nav-connect">
      <button className="btn btn-primary btn-sm" onClick={signIn} disabled={busy}>
        {busy ? 'Check wallet…' : 'Connect wallet'}
      </button>
      {error && <span className="nav-error" role="alert">{error}</span>}
    </span>
  );
}
