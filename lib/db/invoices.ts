import { db } from './client';
import type { Currency } from '@/lib/arc/config';
import type { LineItem } from '@/lib/arc/encode';

export type InvoiceStatus = 'open' | 'paid' | 'void';

export type Invoice = {
  id: string;
  number: string;
  merchant: string;
  client_name: string;
  currency: Currency;
  amount: bigint;
  line_items: LineItem[];
  due_date: string | null;
  memo_id: string;
  content_hash: string;
  created_block: bigint;
  status: InvoiceStatus;
  paid_tx: string | null;
  paid_by: string | null;
  paid_at: Date | null;
  created_at: Date;
};

type Row = Omit<Invoice, 'line_items' | 'amount' | 'created_block'> & {
  amount: string;
  created_block: string;
  line_items: Array<{ description: string; quantity: number; unit_amount: string }>;
};

const COLS = `id, number, merchant, client_name, currency, amount, line_items, to_char(due_date, 'YYYY-MM-DD') as due_date,
  memo_id, content_hash, created_block, status, paid_tx, paid_by, paid_at, created_at`;

function toInvoice(r: Row): Invoice {
  return {
    ...r,
    amount: BigInt(r.amount),
    created_block: BigInt(r.created_block),
    line_items: r.line_items.map(li => ({ ...li, unit_amount: BigInt(li.unit_amount) })),
  };
}

export type NewInvoice = Omit<Invoice, 'status' | 'paid_tx' | 'paid_by' | 'paid_at' | 'created_at'>;

export async function insertInvoice(inv: NewInvoice): Promise<Invoice> {
  const sql = db();
  const line_items = inv.line_items.map(li => ({ ...li, unit_amount: li.unit_amount.toString() }));
  const [row] = await sql<Row[]>`
    insert into invoices (id, number, merchant, client_name, currency, amount, line_items, due_date, memo_id, content_hash, created_block)
    values (${inv.id}, ${inv.number}, ${inv.merchant}, ${inv.client_name}, ${inv.currency}, ${inv.amount.toString()},
            ${sql.json(line_items)}, ${inv.due_date}, ${inv.memo_id}, ${inv.content_hash}, ${inv.created_block.toString()})
    returning ${sql.unsafe(COLS)}`;
  return toInvoice(row);
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const sql = db();
  const [row] = await sql<Row[]>`select ${sql.unsafe(COLS)} from invoices where id = ${id}`;
  return row ? toInvoice(row) : null;
}

export async function getOwnedInvoice(id: string, merchant: string): Promise<Invoice | null> {
  const sql = db();
  const [row] = await sql<Row[]>`select ${sql.unsafe(COLS)} from invoices where id = ${id} and merchant = ${merchant}`;
  return row ? toInvoice(row) : null;
}

export async function listInvoices(merchant: string): Promise<Invoice[]> {
  const sql = db();
  const rows = await sql<Row[]>`select ${sql.unsafe(COLS)} from invoices where merchant = ${merchant} order by created_at desc`;
  return rows.map(toInvoice);
}

export async function nextInvoiceNumber(merchant: string): Promise<string> {
  const [{ n }] = await db()<{ n: string }[]>`select (count(*) + 1)::text as n from invoices where merchant = ${merchant}`;
  return `INV-${n.padStart(4, '0')}`;
}

export async function voidInvoice(id: string, merchant: string): Promise<boolean> {
  const r = await db()`update invoices set status = 'void' where id = ${id} and merchant = ${merchant} and status = 'open'`;
  return r.count === 1;
}

export async function markPaid(id: string, tx: string, payer: string): Promise<boolean> {
  const r = await db()`update invoices set status = 'paid', paid_tx = ${tx}, paid_by = ${payer}, paid_at = now() where id = ${id} and status = 'open'`;
  return r.count === 1;
}

export async function upsertMerchant(address: string): Promise<void> {
  await db()`insert into merchants (address) values (${address}) on conflict (address) do nothing`;
}
