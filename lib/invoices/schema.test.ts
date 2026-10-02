import { describe, expect, it } from 'vitest';
import { createInvoiceSchema, parseMoney } from './schema';

const line = (quantity: number, unit_price: string) => ({ description: 'Work', quantity, unit_price });
const base = { client_name: 'Ada', currency: 'USDC', line_items: [line(1, '1')] };

describe('parseMoney', () => {
  it('parses decimals exactly', () => {
    expect(parseMoney('0.1')).toBe(100_000n);
    expect(parseMoney('12.345678')).toBe(12_345_678n);
    expect(parseMoney('7')).toBe(7_000_000n);
  });

  it.each(['12.3456789', '1e3', '-1', '', '1,000', '.5', '1.'])('rejects %j', s => {
    expect(() => parseMoney(s)).toThrow();
  });
});

describe('createInvoiceSchema', () => {
  it('computes the total from line items', () => {
    const r = createInvoiceSchema.parse({ ...base, line_items: [line(2, '1.50'), line(1, '0.25')] });
    expect(r.amount).toBe(3_250_000n);
    expect(r.line_items[0].unit_amount).toBe(1_500_000n);
  });

  it('rejects zero and more than 20 line items', () => {
    expect(createInvoiceSchema.safeParse({ ...base, line_items: [] }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, line_items: Array(21).fill(line(1, '1')) }).success).toBe(false);
  });

  it('caps the total at 10,000', () => {
    expect(createInvoiceSchema.safeParse({ ...base, line_items: [line(1, '10000')] }).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ ...base, line_items: [line(1, '10000.000001')] }).success).toBe(false);
  });

  it('rejects non-integer and zero quantities', () => {
    expect(createInvoiceSchema.safeParse({ ...base, line_items: [line(0, '1')] }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, line_items: [line(1.5, '1')] }).success).toBe(false);
  });

  it('rejects zero unit prices and bad money strings', () => {
    expect(createInvoiceSchema.safeParse({ ...base, line_items: [line(1, '0')] }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, line_items: [line(1, '1e3')] }).success).toBe(false);
  });

  it('rejects past due dates and unknown currencies', () => {
    expect(createInvoiceSchema.safeParse({ ...base, due_date: '2000-01-01' }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, currency: 'DAI' }).success).toBe(false);
  });

  it('trims and bounds the client name', () => {
    expect(createInvoiceSchema.safeParse({ ...base, client_name: '   ' }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, client_name: 'x'.repeat(101) }).success).toBe(false);
  });
});
