import { describe, expect, it } from 'vitest';
import { decideRecord } from './record';
import type { VerifyResult } from '@/lib/arc/verify';

const ok: VerifyResult = { ok: true, payer: '0x9999999999999999999999999999999999999999', block: 1n };
const TX = '0xaaa';

describe('decideRecord', () => {
  it('marks an open invoice paid on a valid payment', () => {
    expect(decideRecord('open', null, TX, ok)).toEqual({ markPaid: true, payment: { matched: true, reason: null } });
  });

  it('is a no-op when the same tx is claimed again', () => {
    expect(decideRecord('paid', TX, TX, ok)).toEqual({ markPaid: false, payment: null });
  });

  it('records a second valid payment as duplicate', () => {
    expect(decideRecord('paid', '0xbbb', TX, ok)).toEqual({ markPaid: false, payment: { matched: false, reason: 'duplicate' } });
  });

  it('records a payment to a void invoice without reopening it', () => {
    expect(decideRecord('void', null, TX, ok)).toEqual({ markPaid: false, payment: { matched: false, reason: 'invoice_void' } });
  });

  it('stores a wrong-token attempt as a mismatch', () => {
    expect(decideRecord('open', null, TX, { ok: false, reason: 'wrong_token' })).toEqual({ markPaid: false, payment: { matched: false, reason: 'wrong_token' } });
  });

  it('stores a wrong-amount attempt as a mismatch', () => {
    expect(decideRecord('open', null, TX, { ok: false, reason: 'wrong_amount_or_recipient' })).toEqual({ markPaid: false, payment: { matched: false, reason: 'wrong_amount_or_recipient' } });
  });

  it('ignores transactions that are not payments for this invoice', () => {
    expect(decideRecord('open', null, TX, { ok: false, reason: 'no_memo' })).toEqual({ markPaid: false, payment: null });
    expect(decideRecord('open', null, TX, { ok: false, reason: 'tx_failed' })).toEqual({ markPaid: false, payment: null });
  });
});
