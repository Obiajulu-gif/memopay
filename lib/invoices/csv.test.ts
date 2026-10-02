import { describe, expect, it } from 'vitest';
import { invoicesToCsv } from './csv';
import type { Invoice } from '@/lib/db/invoices';

const inv = {
  number: 'INV-0001',
  client_name: 'Ada, "the" dev',
  currency: 'USDC',
  amount: 3_250_000n,
  status: 'paid',
  due_date: null,
  paid_at: new Date('2026-10-05T10:00:00Z'),
  paid_tx: '0xabc',
  paid_by: '0xdef',
} as unknown as Invoice;

describe('invoicesToCsv', () => {
  it('writes the header and a quoted, escaped row', () => {
    const [header, row] = invoicesToCsv([inv]).trim().split('\n');
    expect(header).toBe('number,client,currency,amount,status,due_date,paid_at,paid_tx,paid_by');
    expect(row).toBe('"INV-0001","Ada, ""the"" dev","USDC","3.25","paid","","2026-10-05T10:00:00.000Z","0xabc","0xdef"');
  });

  it('neutralizes spreadsheet formulas', () => {
    const row = invoicesToCsv([{ ...inv, client_name: '=HYPERLINK("x")' }]).trim().split('\n')[1];
    expect(row.split('","')[1]).toBe(`'=HYPERLINK(""x"")`);
  });
});
