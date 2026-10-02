import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/current', () => ({
  getMerchant: async () => '0xbbbb',
  unauthorized: () => Response.json({}, { status: 401 }),
}));
const voidInvoice = vi.fn();
vi.mock('@/lib/db/invoices', () => ({
  getOwnedInvoice: async (_id: string, merchant: string) => (merchant === '0xaaaa' ? { status: 'open' } : null),
  voidInvoice,
}));

const { POST } = await import('@/app/api/invoices/[id]/void/route');

describe('void route ownership', () => {
  it("returns 404 for another merchant's invoice and changes nothing", async () => {
    const res = await POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'inv-of-a' }) });
    expect(res.status).toBe(404);
    expect(voidInvoice).not.toHaveBeenCalled();
  });
});
