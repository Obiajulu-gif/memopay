import { cookies } from 'next/headers';
import { isAddress, isHex, verifyMessage } from 'viem';
import { z } from 'zod';
import { signInMessage } from '@/lib/auth/message';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from '@/lib/auth/session';
import { consumeNonce } from '@/lib/db/nonces';
import { upsertMerchant } from '@/lib/db/invoices';

const Body = z.object({
  address: z.string().refine(a => isAddress(a, { strict: false }), 'Invalid address'),
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  signature: z.string().refine(s => isHex(s), 'Invalid signature'),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const { address, nonce, signature } = parsed.data;

  if (!(await consumeNonce(nonce))) return Response.json({ error: 'Sign-in expired, try again' }, { status: 401 });

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: signInMessage(address, nonce),
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) return Response.json({ error: 'Signature does not match' }, { status: 401 });

  const merchant = address.toLowerCase();
  await upsertMerchant(merchant);
  (await cookies()).set(SESSION_COOKIE, await signSession(merchant), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return Response.json({ address: merchant });
}
