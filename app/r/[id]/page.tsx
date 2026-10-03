import { notFound } from 'next/navigation';
import { currentNetwork, explorerTx } from '@/lib/arc/config';
import { getInvoice } from '@/lib/db/invoices';
import { formatAmount, formatDate } from '@/lib/format';
import PrintButton from './PrintButton';

export const metadata = { title: 'Receipt — MemoPay' };

export default async function ReceiptPage({ params }: PageProps<'/r/[id]'>) {
  const { id } = await params;
  const inv = await getInvoice(id).catch(() => null);
  if (!inv || inv.status !== 'paid') notFound();
  const net = currentNetwork();

  return (
    <div className="container narrow">
      <div className="slip">
        <div className="spread">
          <div>
            <div className="muted small">Payment receipt</div>
            <h1 style={{ marginBottom: 0 }}>{inv.number}</h1>
          </div>
          <span className="badge badge-paid">Paid</span>
        </div>
        <div className="total" style={{ margin: '16px 0' }}>{formatAmount(inv.amount, inv.currency)}</div>

        <dl className="kv">
          <dt>Billed to</dt><dd>{inv.client_name}</dd>
          <dt>Paid to</dt><dd className="mono">{inv.merchant}</dd>
          <dt>Paid by</dt><dd className="mono">{inv.paid_by}</dd>
          <dt>Paid on</dt><dd>{inv.paid_at ? new Date(inv.paid_at).toUTCString() : '—'}</dd>
          <dt>Due date</dt><dd>{formatDate(inv.due_date)}</dd>
          <dt>Transaction</dt>
          <dd><a className="mono" href={explorerTx(net, inv.paid_tx!)} target="_blank" rel="noreferrer">{inv.paid_tx}</a></dd>
          <dt>Network</dt><dd>Arc {net === 'mainnet' ? 'mainnet (chain 5042)' : 'testnet (chain 5042002)'}</dd>
          <dt>Memo ID</dt><dd className="mono">{inv.memo_id}</dd>
          <dt>Content hash</dt><dd className="mono">{inv.content_hash}</dd>
        </dl>

        <div className="table-wrap">
          <table style={{ marginTop: 16 }}>
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
        <p className="muted small" style={{ marginTop: 16 }}>
          Settled on Arc with deterministic finality. The Memo event in this transaction carries the memo ID above, which
          identifies this invoice; the content hash fingerprints the invoice details.
        </p>
      </div>
      <div className="no-print"><PrintButton /></div>
    </div>
  );
}
