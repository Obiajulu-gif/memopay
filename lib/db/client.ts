import postgres from 'postgres';

declare global {
  var __memopaySql: ReturnType<typeof postgres> | undefined;
}

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // prepare:false is required by the Supabase transaction pooler. int8 comes back as string; callers convert with BigInt().
  return postgres(url, { prepare: false });
}

// Lazy so unit tests and builds don't need a database.
export function db() {
  globalThis.__memopaySql ??= make();
  return globalThis.__memopaySql;
}
