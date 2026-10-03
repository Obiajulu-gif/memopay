// Integration check: one transaction may pay two invoices; both payment rows must persist.
// Run against a scratch database: DATABASE_URL=... npx tsx db/check-payments-key.mts
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
await sql.unsafe(readFileSync('db/schema.sql', 'utf8'));
await sql`insert into merchants (address) values ('0xm') on conflict do nothing`;
for (const id of ['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b']) {
  await sql`insert into invoices (id, number, merchant, network, client_name, currency, amount, line_items, memo_id, content_hash, created_block)
            values (${id}, ${id}, '0xm', 'testnet', 'c', 'USDC', 1, '[]', ${id}, '0x', 1) on conflict do nothing`;
  await sql`insert into payments (tx_hash, invoice_id, payer, matched, reason, block)
            values ('0xtx', ${id}, '0xp', true, null, 1) on conflict (tx_hash, invoice_id) do nothing`;
}
const [{ n }] = await sql`select count(*)::int as n from payments where tx_hash = '0xtx'`;
await sql.end();
if (n !== 2) { console.error(`FAIL: expected 2 payment rows for one tx, got ${n}`); process.exit(1); }
console.log('PASS: 2 payment rows for one tx');
