import { redirect } from 'next/navigation';
import { getMerchant } from '@/lib/auth/current';
import SignIn from '@/components/SignIn';

export default async function Home() {
  if (await getMerchant()) redirect('/dashboard');

  return (
    <div className="container narrow">
      <section className="hero">
        <h1>Invoices that reconcile themselves.</h1>
        <p className="muted">
          Send a link. Your client pays in USDC or EURC on Arc. The invoice ID travels with the payment on-chain through
          Arc&apos;s Memo contract, so MemoPay marks it paid in about a second. No matching bank lines to invoices by hand.
        </p>
      </section>
      <div className="card">
        <SignIn />
      </div>
      <div className="steps">
        <div className="card">
          <h2>1. Create</h2>
          <p className="muted small">Add line items in USDC or EURC. Get a share link and QR code.</p>
        </div>
        <div className="card">
          <h2>2. Get paid</h2>
          <p className="muted small">Your client pays with one transaction. The fee is about $0.001, paid in USDC.</p>
        </div>
        <div className="card">
          <h2>3. Reconciled</h2>
          <p className="muted small">The server checks the Memo event on Arc and marks the invoice paid. Export CSV for your books.</p>
        </div>
      </div>
    </div>
  );
}
