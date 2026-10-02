import { describe, expect, it } from 'vitest';
import { rateLimit } from './ratelimit';

describe('rateLimit', () => {
  it('allows 10 calls per window then blocks until the window resets', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) expect(rateLimit('ip-a', 10, 60_000, t0 + i)).toBe(true);
    expect(rateLimit('ip-a', 10, 60_000, t0 + 11)).toBe(false);
    expect(rateLimit('ip-b', 10, 60_000, t0 + 11)).toBe(true);
    expect(rateLimit('ip-a', 10, 60_000, t0 + 60_000)).toBe(true);
  });
});
