import { settlementAddress } from '@/lib/arc/config';
import DeployContract from './DeployContract';

export const metadata = { title: 'Deploy settlement contract — MemoPay' };

export default function DeployPage() {
  return (
    <div className="container narrow">
      <h1>Deploy the settlement contract</h1>
      <p className="muted">
        MemoPayInvoices holds the rules: it pays out only against a merchant-signed invoice, for exactly the signed amount,
        once. Deploying it from your own wallet makes you its deployer; the contract has no owner and no admin functions.
      </p>
      <div className="card">
        <DeployContract configured={settlementAddress()} />
      </div>
    </div>
  );
}
