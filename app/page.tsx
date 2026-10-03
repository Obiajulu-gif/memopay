import { redirect } from 'next/navigation';
import { getMerchant } from '@/lib/auth/current';
import SignIn from '@/components/SignIn';
import LiveSlip from '@/components/LiveSlip';

export default async function Home() {
  if (await getMerchant()) redirect('/dashboard');

  return (
    <div className="container">
      <section className="hero">
        <div>
          <h1>Get paid in stablecoins. Skip the reconciling.</h1>
          <p className="lede">
            Send an invoice link. Your client pays in USDC or EURC on Arc, and the invoice ID rides along with the
            payment on-chain. MemoPay sees it settle and marks the invoice paid.
          </p>
          <div className="signin">
            <SignIn />
          </div>
        </div>
        <LiveSlip />
      </section>

      <section className="flow" aria-label="How it works">
        <div>
          <span className="n">1</span>
          <h2>Create the invoice</h2>
          <p className="muted small">Add line items in USDC or EURC. You get a pay link and a QR code to share.</p>
        </div>
        <div>
          <span className="n">2</span>
          <h2>Client pays once</h2>
          <p className="muted small">One transaction from any regular wallet. The network fee is about $0.001, paid in USDC.</p>
        </div>
        <div>
          <span className="n">3</span>
          <h2>Marked paid</h2>
          <p className="muted small">MemoPay checks the memo on Arc and closes the invoice. Export everything to CSV for your books.</p>
        </div>
      </section>

      <p className="footer-note">
        Payments go through Arc&apos;s Memo contract, so the invoice reference is part of the transaction itself, not a
        note someone has to remember to type.
      </p>
    </div>
  );
}
