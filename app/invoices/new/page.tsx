import { redirect } from 'next/navigation';
import { getMerchant } from '@/lib/auth/current';
import NewInvoiceForm from './NewInvoiceForm';

export default async function NewInvoicePage() {
  if (!(await getMerchant())) redirect('/');
  return (
    <div className="container narrow">
      <h1>New invoice</h1>
      <p className="muted">Invoices can&apos;t be edited after creation, because their hash is attached to the payment on-chain.</p>
      <NewInvoiceForm />
    </div>
  );
}
