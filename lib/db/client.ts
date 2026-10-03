import postgres from 'postgres';

declare global {
  var __memopaySql: ReturnType<typeof postgres> | undefined;
}

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Works with Neon's pooled URL (sslmode=require in the string) and any Postgres.
  // prepare:false is required by transaction poolers (Neon/PgBouncer). Small pool per serverless instance.
  // int8 comes back as string; callers convert with BigInt().
  return postgres(url, { prepare: false, max: 3, idle_timeout: 20 });
}

// Lazy so unit tests and builds don't need a database.
export function db() {
  globalThis.__memopaySql ??= make();
  return globalThis.__memopaySql;
}
