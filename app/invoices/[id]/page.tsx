import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMerchant } from '@/lib/auth/current';
import { currentNetwork, explorerTx } from '@/lib/arc/config';
import { getOwnedInvoice } from '@/lib/db/invoices';
import { listPayments } from '@/lib/db/payments';
import { formatAmount, formatDate, shortAddr } from '@/lib/format';
import InvoiceActions from './InvoiceActions';

const REASONS: Record<string, string> = {
  wrong_token: 'Paid with the wrong token',
  wrong_amount_or_recipient: 'Wrong amount or recipient',
  duplicate: 'Extra payment (invoice was already paid)',
  invoice_void: 'Paid after the invoice was voided',
};

export default async function InvoicePage({ params }: PageProps<'/invoices/[id]'>) {
  const merchant = await getMerchant();
  if (!merchant) redirect('/');
  const { id } = await params;
  const inv = await getOwnedInvoice(id, merchant).catch(() => null);
  if (!inv) notFound();
  const payments = await listPayments(inv.id);
  const net = currentNetwork();
  const payUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/pay/${inv.id}`;

  return (
    <div className="container">
      <p><Link href="/dashboard">← All invoices</Link></p>
      <div className="spread">
        <h1>{inv.number}</h1>
        <span className={`badge badge-${inv.status}`}>{inv.status}</span>
      </div>
      <p className="muted">For {inv.client_name}, due {formatDate(inv.due_date)}</p>

      <div className="slip">
        <div className="total">{formatAmount(inv.amount, inv.currency)}</div>
        <div className="table-wrap">
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Total</th></tr></thead>
            <tbody>
              {inv.line_items.map((l, i) => (
                <tr key={i}>
                  <td>{l.description}</td>
                  <td className="num">{l.quantity}</td>
                  <td className="num">{formatAmount(l.unit_amount, inv.currency)}</td>
                  <td className="num">{formatAmount(l.unit_amount * BigInt(l.quantity), inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <InvoiceActions id={inv.id} status={inv.status} payUrl={payUrl} />

      {inv.status === 'paid' && (
        <div className="card">
          <h2>Payment</h2>
          <dl className="kv">
            <dt>Paid at</dt><dd>{inv.paid_at ? new Date(inv.paid_at).toUTCString() : '—'}</dd>
            <dt>Payer</dt><dd className="mono">{inv.paid_by}</dd>
            <dt>Transaction</dt><dd><a className="mono" href={explorerTx(net, inv.paid_tx!)} target="_blank" rel="noreferrer">{shortAddr(inv.paid_tx!)}</a></dd>
          </dl>
          <p style={{ marginTop: 12 }}><Link href={`/r/${inv.id}`}>View receipt →</Link></p>
        </div>
      )}

      <div className="card table-wrap">
        <h2>On-chain activity</h2>
        {payments.length === 0 ? (
          <p className="muted small">No payments seen for this invoice yet.</p>
        ) : (
          <table>
            <thead><tr><th>Transaction</th><th>From</th><th>Result</th></tr></thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.tx_hash}>
                  <td><a className="mono" href={explorerTx(net, p.tx_hash)} target="_blank" rel="noreferrer">{shortAddr(p.tx_hash)}</a></td>
                  <td className="mono">{shortAddr(p.payer)}</td>
                  <td>{p.matched ? <span className="badge badge-paid">Matched</span> : <span className="badge badge-bad">{REASONS[p.reason ?? ''] ?? p.reason}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small" style={{ marginTop: 12 }}>
          Memo ID <code>{inv.memo_id}</code>
          <br />
          Content hash <code>{inv.content_hash}</code>
        </p>
      </div>
    </div>
  );
}
