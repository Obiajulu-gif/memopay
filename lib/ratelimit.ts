// ponytail: per-instance memory, move to Postgres/Upstash if abuse appears.
const hits = new Map<string, { start: number; count: number }>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || now - h.start >= windowMs) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { start: now, count: 1 });
    return true;
  }
  h.count++;
  return h.count <= limit;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
