import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentNetwork } from '@/lib/arc/config';
import { getInvoice } from '@/lib/db/invoices';
import { formatAmount, formatDate, shortAddr } from '@/lib/format';
import PayButton from './PayButton';

export const metadata = { title: 'Pay invoice — MemoPay' };

export default async function PayPage({ params }: PageProps<'/pay/[id]'>) {
  const { id } = await params;
  const inv = await getInvoice(id).catch(() => null);
  if (!inv) notFound();

  return (
    <div className="container narrow">
      <div className="slip">
        <div className="spread">
          <div>
            <div className="muted small">Invoice {inv.number}</div>
            <h1 style={{ marginBottom: 0 }}>{formatAmount(inv.amount, inv.currency)}</h1>
          </div>
          <span className={`badge badge-${inv.status}`}>{inv.status}</span>
        </div>
        <dl className="kv" style={{ marginTop: 16 }}>
          <dt>Billed to</dt><dd>{inv.client_name}</dd>
          <dt>Pay to</dt><dd className="mono" title={inv.merchant}>{shortAddr(inv.merchant)}</dd>
          <dt>Due</dt><dd>{formatDate(inv.due_date)}</dd>
          <dt>Network</dt><dd>Arc {inv.network === 'mainnet' ? 'mainnet' : 'testnet'}</dd>
        </dl>
        <div className="table-wrap">
          <table style={{ marginTop: 16 }}>
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Total</th></tr></thead>
            <tbody>
              {inv.line_items.map((l, i) => (
                <tr key={i}>
                  <td>{l.description}</td>
                  <td className="num">{l.quantity}</td>
                  <td className="num">{formatAmount(l.unit_amount * BigInt(l.quantity), inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        {inv.status === 'paid' && (
          <div className="stack">
            <div className="alert alert-ok">This invoice has been paid.</div>
            <Link className="btn" href={`/r/${inv.id}`}>View receipt</Link>
          </div>
        )}
        {inv.status === 'void' && <div className="alert alert-info">This invoice was cancelled by the sender. Don&apos;t pay it.</div>}
        {inv.status === 'open' && inv.network !== currentNetwork() && (
          <div className="alert alert-error">This invoice is payable on Arc {inv.network}, not on this site&apos;s network.</div>
        )}
        {inv.status === 'open' && inv.network === currentNetwork() && !inv.settlement && (
          <div className="alert alert-info">This invoice was created before on-chain settlement. Ask the sender for a new link.</div>
        )}
        {inv.status === 'open' && inv.network === currentNetwork() && inv.settlement && inv.merchant_sig && (
          <PayButton
            invoice={{
              id: inv.id,
              number: inv.number,
              content_hash: inv.content_hash,
              merchant: inv.merchant,
              amount: inv.amount.toString(),
              currency: inv.currency,
              merchant_sig: inv.merchant_sig,
              settlement: inv.settlement,
            }}
          />
        )}
      </div>
      <p className="muted small">
        Paid through the MemoPay settlement contract on Arc. It only accepts exactly this amount for this invoice, once, and
        Arc&apos;s Memo contract attaches the invoice ID to the payment.
      </p>
    </div>
  );
}
