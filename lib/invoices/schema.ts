import { parseUnits } from 'viem';
import { z } from 'zod';
import { CURRENCIES } from '@/lib/arc/config';

const MONEY_RE = /^\d+(\.\d{1,6})?$/;
export const MAX_AMOUNT = 10_000_000_000n; // 10,000 in 6-decimal units

export function parseMoney(s: string): bigint {
  if (!MONEY_RE.test(s)) throw new Error(`Invalid amount: ${s}`);
  return parseUnits(s, 6);
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

const lineItem = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(1000),
  unit_price: z.string().trim().regex(MONEY_RE, 'Use a number with up to 6 decimals'),
});

export const createInvoiceSchema = z
  .object({
    client_name: z.string().trim().min(1).max(100),
    currency: z.enum(CURRENCIES as ['USDC', 'EURC']),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(d => d >= todayUtc(), 'Due date is in the past')
      .nullish()
      .transform(d => d ?? null),
    line_items: z.array(lineItem).min(1).max(20),
  })
  .transform(v => {
    const line_items = v.line_items.map(li => ({
      description: li.description,
      quantity: li.quantity,
      unit_amount: parseMoney(li.unit_price),
    }));
    const amount = line_items.reduce((s, li) => s + li.unit_amount * BigInt(li.quantity), 0n);
    return { ...v, line_items, amount };
  })
  .refine(v => v.line_items.every(li => li.unit_amount > 0n), { message: 'Unit price must be above 0', path: ['line_items'] })
  .refine(v => v.amount > 0n && v.amount <= MAX_AMOUNT, { message: 'Total must be above 0 and at most 10,000', path: ['line_items'] });

export type CreateInvoiceInput = z.output<typeof createInvoiceSchema>;
