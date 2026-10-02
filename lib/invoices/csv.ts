import { formatUnits } from 'viem';
import type { Invoice } from '@/lib/db/invoices';

const HEADER = 'number,client,currency,amount,status,due_date,paid_at,paid_tx,paid_by';

function cell(v: string | null | undefined): string {
  let s = v ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets from running formulas
  return `"${s.replace(/"/g, '""')}"`;
}

export function invoicesToCsv(rows: Invoice[]): string {
  const lines = rows.map(r =>
    [
      r.number,
      r.client_name,
      r.currency,
      formatUnits(r.amount, 6),
      r.status,
      r.due_date,
      r.paid_at ? new Date(r.paid_at).toISOString() : null,
      r.paid_tx,
      r.paid_by,
    ].map(cell).join(','),
  );
  return [HEADER, ...lines].join('\n') + '\n';
}
