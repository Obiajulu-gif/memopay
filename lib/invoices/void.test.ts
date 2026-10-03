import { beforeEach, describe, expect, it, vi } from 'vitest';

let chainStatus = 0;
const readContract = vi.fn(async () => chainStatus);
vi.mock('@/lib/arc/config', async orig => ({
  ...(await orig<typeof import('@/lib/arc/config')>()),
  publicClient: () => ({ readContract }),
}));
vi.mock('@/lib/auth/current', () => ({
  getMerchant: async () => '0xaaaa',
  unauthorized: () => Response.json({}, { status: 401 }),
}));
const voidInvoice = vi.fn(async () => true);
let stored: Record<string, unknown> = {};
vi.mock('@/lib/db/invoices', () => ({
  getOwnedInvoice: async () => stored,
  voidInvoice,
}));

const { POST } = await import('@/app/api/invoices/[id]/void/route');
const call = () => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'x' }) });

beforeEach(() => {
  voidInvoice.mockClear();
  readContract.mockClear();
  stored = { status: 'open', memo_id: '0x01', merchant: '0xaaaa', settlement: '0x5555555555555555555555555555555555555555' };
});

describe('void route with a settlement invoice', () => {
  it('refuses until the invoice is cancelled on-chain', async () => {
    chainStatus = 0; // Open
    expect((await call()).status).toBe(409);
    expect(voidInvoice).not.toHaveBeenCalled();
  });

  it('voids once the contract reports Cancelled', async () => {
    chainStatus = 2; // Cancelled
    expect((await call()).status).toBe(200);
    expect(voidInvoice).toHaveBeenCalledOnce();
  });

  it('refuses when the invoice was already paid on-chain', async () => {
    chainStatus = 1; // Paid
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/paid/i);
  });

  it('voids legacy invoices without a chain check', async () => {
    stored = { ...stored, settlement: null };
    expect((await call()).status).toBe(200);
    expect(readContract).not.toHaveBeenCalled();
  });
});
