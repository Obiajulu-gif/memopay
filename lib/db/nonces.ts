import { randomBytes } from 'node:crypto';
import { db } from './client';

export async function createNonce(): Promise<string> {
  const nonce = randomBytes(16).toString('hex');
  const sql = db();
  await sql`delete from auth_nonces where expires_at < now()`;
  await sql`insert into auth_nonces (nonce, expires_at) values (${nonce}, now() + interval '5 minutes')`;
  return nonce;
}

// Single use: deleting and checking expiry in one statement.
export async function consumeNonce(nonce: string): Promise<boolean> {
  const rows = await db()`delete from auth_nonces where nonce = ${nonce} and expires_at > now() returning nonce`;
  return rows.length === 1;
}
