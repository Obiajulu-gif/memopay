import { cookies } from 'next/headers';
import { SESSION_COOKIE, readSession } from './session';

// Returns the signed-in merchant address (lowercase) or null.
export async function getMerchant(): Promise<string | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export const unauthorized = () => Response.json({ error: 'Sign in first' }, { status: 401 });
