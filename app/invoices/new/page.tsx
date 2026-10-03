import { redirect } from 'next/navigation';
import { getMerchant } from '@/lib/auth/current';
import NewInvoiceForm from './NewInvoiceForm';

export default async function NewInvoicePage() {
  if (!(await getMerchant())) redirect('/');
  return (
    <div className="container narrow">
      <h1>New invoice</h1>
      <p className="muted">
        You&apos;ll sign the invoice terms in your wallet. It&apos;s free, and the settlement contract only pays out against
        that signature. Invoices can&apos;t be edited afterwards.
      </p>
      <NewInvoiceForm />
    </div>
  );
}
