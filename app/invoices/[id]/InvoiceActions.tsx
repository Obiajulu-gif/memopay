'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

export default function InvoiceActions({ id, status, payUrl }: { id: string; status: string; payUrl: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const autoChecked = useRef(false);
  const fullUrl = payUrl.startsWith('http') ? payUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${payUrl}`;

  async function recheck(silent = false) {
    setBusy(true);
    const res = await fetch(`/api/invoices/${id}/recheck`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (!silent) setMsg({ kind: 'error', text: body.error ?? 'Recheck failed' });
      return;
    }
    if (body.status !== status || body.found > 0) router.refresh();
    if (!silent) setMsg({ kind: body.status === 'paid' ? 'ok' : 'info', text: body.status === 'paid' ? 'Payment found on Arc.' : `No matching payment yet (${body.found} memo transaction${body.found === 1 ? '' : 's'} seen).` });
  }

  useEffect(() => {
    if (status === 'open' && !autoChecked.current) {
      autoChecked.current = true;
      void recheck(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function voidIt() {
    if (!confirm('Void this invoice? The pay link will stop accepting payments.')) return;
    setBusy(true);
    const res = await fetch(`/api/invoices/${id}/void`, { method: 'POST' });
    setBusy(false);
    if (res.ok) router.refresh();
    else setMsg({ kind: 'error', text: (await res.json().catch(() => ({}))).error ?? 'Could not void' });
  }

  if (status !== 'open') return null;

  return (
    <div className="card">
      <h2>Share with your client</h2>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="qr"><QRCodeSVG value={fullUrl} size={132} /></div>
        <div className="stack" style={{ flex: 1, minWidth: 220 }}>
          <input readOnly value={fullUrl} onFocus={e => e.target.select()} aria-label="Pay link" />
          <div className="row">
            <button className="btn btn-primary" onClick={async () => { await navigator.clipboard.writeText(fullUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a className="btn" href={fullUrl} target="_blank" rel="noreferrer">Open pay page</a>
            <button className="btn" onClick={() => recheck()} disabled={busy}>{busy ? 'Checking…' : 'Recheck payment'}</button>
            <button className="btn btn-danger" onClick={voidIt} disabled={busy}>Void</button>
          </div>
        </div>
      </div>
      {msg && <div className={`alert alert-${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}
    </div>
  );
}
