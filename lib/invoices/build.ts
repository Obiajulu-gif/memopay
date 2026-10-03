import { isHex, parseSignature, serializeSignature, verifyTypedData } from 'viem';
import { arcConfig, type ArcNetwork, type Hex } from '@/lib/arc/config';
import { contentHash, memoIdFor, type InvoiceContent } from '@/lib/arc/encode';
import { invoiceTypedData, type SettlementInvoice } from '@/lib/arc/settlement';
import type { CreateInvoiceInput } from './schema';

/// Everything derived from a validated invoice: the stored content hash and the terms the merchant signs.
export function buildInvoice(input: CreateInvoiceInput, merchant: string, id: string, number: string, network: ArcNetwork) {
  const content: InvoiceContent = {
    number,
    merchant,
    client_name: input.client_name,
    currency: input.currency,
    amount: input.amount,
    line_items: input.line_items,
    due_date: input.due_date,
  };
  const hash = contentHash(content);
  const memoId = memoIdFor(id);
  const terms: SettlementInvoice = {
    id: memoId,
    merchant: merchant as Hex,
    token: arcConfig(network).tokens[input.currency],
    amount: input.amount,
    contentHash: hash,
  };
  return { content, contentHash: hash, memoId, terms };
}

const HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

/// Returns the signature in the exact form the contract accepts (65 bytes, v = 27/28, low s),
/// or null if it isn't the merchant's signature over these terms or the contract would reject it.
export async function checkMerchantSig(settlement: Hex, chainId: number, terms: SettlementInvoice, sig: string): Promise<Hex | null> {
  if (!isHex(sig) || sig.length !== 132) return null;
  try {
    const { r, s, yParity } = parseSignature(sig);
    if (BigInt(s) > HALF_ORDER) return null;
    const normalized = serializeSignature({ r, s, v: BigInt(27 + yParity) });
    const ok = await verifyTypedData({ address: terms.merchant, ...invoiceTypedData(settlement, chainId, terms), signature: normalized });
    return ok ? normalized : null;
  } catch {
    return null;
  }
}
