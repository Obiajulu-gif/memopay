import { randomUUID } from 'node:crypto';
import { getMerchant, unauthorized } from '@/lib/auth/current';
import { arcConfig, currentNetwork, publicClient, settlementAddress } from '@/lib/arc/config';
import { insertInvoice, nextInvoiceNumber } from '@/lib/db/invoices';
import { buildInvoice, checkMerchantSig } from '@/lib/invoices/build';
import { createInvoiceSchema } from '@/lib/invoices/schema';

const ZERO = '0x0000000000000000000000000000000000000000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER_RE = /^INV-\d{4,}$/;

/// Two steps. Without `signature`: returns a draft (id, number, terms) for the merchant to sign.
/// With `draft` + `signature`: recomputes the terms, checks the merchant signed them, and saves.
export async function POST(req: Request) {
  const merchant = await getMerchant();
  if (!merchant) return unauthorized();
  if (merchant === ZERO) return Response.json({ error: 'Invalid merchant address' }, { status: 400 });

  const settlement = settlementAddress();
  if (!settlement) return Response.json({ error: 'The settlement contract is not configured yet' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Invalid invoice', issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  const network = currentNetwork();
  const chainId = arcConfig(network).chainId;

  const signature = typeof body?.signature === 'string' ? body.signature : null;
  const draft = body?.draft as { id?: unknown; number?: unknown } | undefined;

  if (!signature) {
    const id = randomUUID();
    const number = await nextInvoiceNumber(merchant);
    const { terms } = buildInvoice(input, merchant, id, number, network);
    return Response.json({
      draft: { id, number },
      sign: { settlement, chainId, terms: { ...terms, amount: terms.amount.toString() } },
    });
  }

  if (typeof draft?.id !== 'string' || !UUID_RE.test(draft.id) || typeof draft.number !== 'string' || !NUMBER_RE.test(draft.number)) {
    return Response.json({ error: 'Invalid draft' }, { status: 400 });
  }
  const built = buildInvoice(input, merchant, draft.id, draft.number, network);
  const merchantSig = await checkMerchantSig(settlement, chainId, built.terms, signature);
  if (!merchantSig) return Response.json({ error: 'Sign with the wallet you signed in with' }, { status: 400 });

  let created_block: bigint;
  try {
    created_block = await publicClient().getBlockNumber();
  } catch {
    return Response.json({ error: 'Network busy, try again' }, { status: 503 });
  }

  try {
    const inv = await insertInvoice({
      ...built.content,
      network,
      id: draft.id,
      memo_id: built.memoId,
      content_hash: built.contentHash,
      merchant_sig: merchantSig,
      settlement,
      created_block,
    });
    return Response.json({ id: inv.id }, { status: 201 });
  } catch (e) {
    // Another invoice took this number between draft and save: the merchant signs a fresh draft.
    if ((e as { code?: string }).code === '23505') return Response.json({ error: 'Invoice number was just taken, please try again' }, { status: 409 });
    throw e;
  }
}
