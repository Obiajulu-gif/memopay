import { encodeFunctionData, keccak256, stringToHex, toBytes } from 'viem';
import { erc20Abi } from './abi';
import type { Currency, Hex } from './config';

export type LineItem = { description: string; quantity: number; unit_amount: bigint };

export type InvoiceContent = {
  number: string;
  merchant: string;
  client_name: string;
  currency: Currency;
  amount: bigint;
  line_items: LineItem[];
  due_date: string | null;
};

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v).sort().map(k => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export function contentHash(c: InvoiceContent): Hex {
  return keccak256(toBytes(canonicalJson(c)));
}

export function memoIdFor(invoiceId: string): Hex {
  return keccak256(toBytes(`memopay:v1:${invoiceId}`));
}

export function memoDataFor(number: string, contentHash: string): Hex {
  return stringToHex(`memopay:v1:${number}:${contentHash}`);
}

export function transferCallData(merchant: Hex, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [merchant, amount] });
}

export function memoCallArgs(
  inv: { id: string; number: string; content_hash: string; merchant: string; amount: bigint },
  token: Hex,
): readonly [Hex, Hex, Hex, Hex] {
  return [
    token,
    transferCallData(inv.merchant as Hex, inv.amount),
    memoIdFor(inv.id),
    memoDataFor(inv.number, inv.content_hash),
  ] as const;
}
