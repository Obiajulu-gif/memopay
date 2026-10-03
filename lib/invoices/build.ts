import { isHex, verifyTypedData } from 'viem';
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

export async function checkMerchantSig(settlement: Hex, chainId: number, terms: SettlementInvoice, sig: string): Promise<boolean> {
  if (!isHex(sig) || sig.length !== 132) return false;
  try {
    return await verifyTypedData({ address: terms.merchant, ...invoiceTypedData(settlement, chainId, terms), signature: sig });
  } catch {
    return false;
  }
}
