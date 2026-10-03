import { cookies } from 'next/headers';
import { z } from 'zod';
import { checkSignIn } from '@/lib/auth/message';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from '@/lib/auth/session';
import { consumeNonce } from '@/lib/db/nonces';
import { upsertMerchant } from '@/lib/db/invoices';

const Body = z.object({ message: z.string().max(2000), signature: z.string().max(1000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });

  const host = req.headers.get('host') ?? '';
  const signer = await checkSignIn(parsed.data.message, parsed.data.signature, host);
  if (!signer) return Response.json({ error: 'Signature does not match this site' }, { status: 401 });
  if (!(await consumeNonce(signer.nonce))) return Response.json({ error: 'Sign-in expired, try again' }, { status: 401 });

  await upsertMerchant(signer.address);
  (await cookies()).set(SESSION_COOKIE, await signSession(signer.address), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return Response.json({ address: signer.address });
}
