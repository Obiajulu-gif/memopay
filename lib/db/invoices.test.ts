import { describe, expect, it } from 'vitest';
import { getInvoice, getOwnedInvoice } from './invoices';

// No DATABASE_URL in tests: a lookup that reached the database would throw.
describe('invoice lookups with malformed ids', () => {
  it('return null without querying', async () => {
    delete process.env.DATABASE_URL;
    expect(await getInvoice('not-a-uuid')).toBeNull();
    expect(await getOwnedInvoice("1' or '1'='1", '0xabc')).toBeNull();
  });
});
