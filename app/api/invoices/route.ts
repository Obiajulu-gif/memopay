import { randomUUID } from 'node:crypto';
import { getMerchant, unauthorized } from '@/lib/auth/current';
import { publicClient } from '@/lib/arc/config';
import { contentHash, memoIdFor } from '@/lib/arc/encode';
import { insertInvoice, nextInvoiceNumber } from '@/lib/db/invoices';
import { createInvoiceSchema } from '@/lib/invoices/schema';

const ZERO = '0x0000000000000000000000000000000000000000';

export async function POST(req: Request) {
  const merchant = await getMerchant();
  if (!merchant) return unauthorized();
  if (merchant === ZERO) return Response.json({ error: 'Invalid merchant address' }, { status: 400 });

  const parsed = createInvoiceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid invoice', issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;

  let created_block: bigint;
  try {
    created_block = await publicClient().getBlockNumber();
  } catch {
    return Response.json({ error: 'Network busy, try again' }, { status: 503 });
  }

  // One retry covers two invoices created at the same moment getting the same number.
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = randomUUID();
    const number = await nextInvoiceNumber(merchant);
    const content = { number, merchant, client_name: input.client_name, currency: input.currency, amount: input.amount, line_items: input.line_items, due_date: input.due_date };
    try {
      const inv = await insertInvoice({ ...content, id, memo_id: memoIdFor(id), content_hash: contentHash(content), created_block });
      return Response.json({ id: inv.id }, { status: 201 });
    } catch (e) {
      if ((e as { code?: string }).code !== '23505' || attempt === 1) throw e;
    }
  }
}
