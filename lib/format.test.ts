import { describe, expect, it } from 'vitest';
import { formatAmount } from './format';

describe('formatAmount', () => {
  it('shows at least two decimals and groups thousands', () => {
    expect(formatAmount(3_250_000n, 'USDC')).toBe('3.25 USDC');
    expect(formatAmount(10_000_000_000n, 'EURC')).toBe('10,000.00 EURC');
    expect(formatAmount('50000', 'USDC')).toBe('0.05 USDC');
    expect(formatAmount(1n, 'USDC')).toBe('0.000001 USDC');
  });
});
