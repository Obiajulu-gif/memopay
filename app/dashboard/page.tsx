import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMerchant } from '@/lib/auth/current';
import { listInvoices } from '@/lib/db/invoices';
import { formatAmount, formatDate } from '@/lib/format';

export default async function Dashboard() {
  const merchant = await getMerchant();
  if (!merchant) redirect('/');
  const invoices = await listInvoices(merchant);

  const paid: Record<string, bigint> = {};
  const outstanding: Record<string, bigint> = {};
  for (const i of invoices) {
    const bucket = i.status === 'paid' ? paid : i.status === 'open' ? outstanding : null;
    if (bucket) bucket[i.currency] = (bucket[i.currency] ?? 0n) + i.amount;
  }
  const sums = (r: Record<string, bigint>) =>
    Object.keys(r).length ? Object.entries(r).map(([c, a]) => formatAmount(a, c)).join(' · ') : '—';

  return (
    <div className="container">
      <div className="spread" style={{ marginBottom: 20 }}>
        <h1>Invoices</h1>
        <div className="row">
          {invoices.length > 0 && <a className="btn" href="/api/invoices/export.csv">Export CSV</a>}
          <Link className="btn btn-primary" href="/invoices/new">New invoice</Link>
        </div>
      </div>

      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="card"><div className="muted small">Paid</div><div style={{ fontWeight: 700 }}>{sums(paid)}</div></div>
        <div className="card"><div className="muted small">Outstanding</div><div style={{ fontWeight: 700 }}>{sums(outstanding)}</div></div>
      </div>

      <div className="card table-wrap">
        {invoices.length === 0 ? (
          <p className="muted">No invoices yet. <Link href="/invoices/new">Create your first one.</Link></p>
        ) : (
          <table>
            <thead>
              <tr><th>Number</th><th>Client</th><th className="num">Amount</th><th>Status</th><th>Due</th></tr>
            </thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.id}>
                  <td><Link href={`/invoices/${i.id}`}>{i.number}</Link></td>
                  <td>{i.client_name}</td>
                  <td className="num">{formatAmount(i.amount, i.currency)}</td>
                  <td><span className={`badge badge-${i.status}`}>{i.status}</span></td>
                  <td>{formatDate(i.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
