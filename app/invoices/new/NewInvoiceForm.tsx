'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseMoney } from '@/lib/invoices/schema';
import { formatAmount } from '@/lib/format';
import { connectWallet, walletError } from '@/lib/arc/browser';
import { invoiceTypedData } from '@/lib/arc/settlement';

type Line = { description: string; quantity: string; unit_price: string };
const empty: Line = { description: '', quantity: '1', unit_price: '' };

function lineTotal(l: Line): bigint | null {
  try {
    const q = Number(l.quantity);
    if (!Number.isInteger(q) || q < 1) return null;
    return parseMoney(l.unit_price.trim()) * BigInt(q);
  } catch {
    return null;
  }
}

export default function NewInvoiceForm() {
  const router = useRouter();
  const [client, setClient] = useState('');
  const [currency, setCurrency] = useState<'USDC' | 'EURC'>('USDC');
  const [due, setDue] = useState('');
  const [lines, setLines] = useState<Line[]>([{ ...empty }]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const totals = lines.map(lineTotal);
  const total = totals.every(t => t !== null) ? totals.reduce((s, t) => s + (t as bigint), 0n) : null;

  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const [step, setStep] = useState<'idle' | 'drafting' | 'signing' | 'saving'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const input = {
      client_name: client,
      currency,
      due_date: due || null,
      line_items: lines.map(l => ({ description: l.description, quantity: Number(l.quantity), unit_price: l.unit_price.trim() })),
    };
    const post = (body: object) =>
      fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
        async r => ({ status: r.status, body: await r.json().catch(() => ({})) }),
      );
    const fail = (body: { issues?: { path: (string | number)[]; message: string }[]; error?: string }) => {
      setErrors(body.issues?.map(i => `${i.path.join(' › ') || 'Invoice'}: ${i.message}`) ?? [body.error ?? 'Could not create invoice']);
      setBusy(false);
      setStep('idle');
    };

    setBusy(true);
    setStep('drafting');
    const draft = await post(input);
    if (draft.status !== 200) return fail(draft.body);

    // The merchant signs the invoice terms (free, no transaction). The contract only pays out against this signature.
    setStep('signing');
    let signature: string;
    try {
      const { wallet, address } = await connectWallet();
      const { settlement, chainId, terms } = draft.body.sign;
      signature = await wallet.signTypedData({
        account: address,
        ...invoiceTypedData(settlement, chainId, { ...terms, amount: BigInt(terms.amount) }),
      });
    } catch (err) {
      return fail({ error: walletError(err) });
    }

    setStep('saving');
    const saved = await post({ ...input, draft: draft.body.draft, signature });
    if (saved.status === 201) {
      router.push(`/invoices/${saved.body.id}`);
      return;
    }
    fail(saved.body);
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="grid2">
        <div className="field">
          <label htmlFor="client">Client name</label>
          <input id="client" value={client} onChange={e => setClient(e.target.value)} maxLength={100} required />
        </div>
        <div className="field">
          <label htmlFor="currency">Currency</label>
          <select id="currency" value={currency} onChange={e => setCurrency(e.target.value as 'USDC' | 'EURC')}>
            <option value="USDC">USDC (US dollar)</option>
            <option value="EURC">EURC (euro)</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="due">Due date (optional)</label>
        <input id="due" type="date" value={due} onChange={e => setDue(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
      </div>

      <h2 style={{ marginTop: 8 }}>Line items</h2>
      {lines.map((l, i) => (
        <div className="line" key={i}>
          <div>
            {i === 0 && <label>Description</label>}
            <input aria-label={`Description ${i + 1}`} value={l.description} maxLength={200} onChange={e => setLine(i, { description: e.target.value })} required />
          </div>
          <div>
            {i === 0 && <label>Qty</label>}
            <input aria-label={`Quantity ${i + 1}`} type="number" min={1} max={1000} step={1} value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} required />
          </div>
          <div>
            {i === 0 && <label>Unit price</label>}
            <input aria-label={`Unit price ${i + 1}`} inputMode="decimal" placeholder="0.00" value={l.unit_price} onChange={e => setLine(i, { unit_price: e.target.value })} required />
          </div>
          <button type="button" className="btn btn-danger" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn" disabled={lines.length >= 20} onClick={() => setLines(ls => [...ls, { ...empty }])}>
        + Add line
      </button>

      <div className="spread" style={{ marginTop: 20 }}>
        <div>
          <div className="muted small">Total</div>
          <div className="total">{total !== null ? formatAmount(total, currency) : '—'}</div>
        </div>
        <button className="btn btn-primary" disabled={busy || total === null || total === 0n}>
          {step === 'signing' ? 'Sign in your wallet…' : busy ? 'Creating…' : 'Sign & create invoice'}
        </button>
      </div>
      {errors.length > 0 && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          {errors.map(e => <div key={e}>{e}</div>)}
        </div>
      )}
    </form>
  );
}
