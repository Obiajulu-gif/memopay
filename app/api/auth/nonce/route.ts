import { createNonce } from '@/lib/db/nonces';

export async function GET() {
  return Response.json({ nonce: await createNonce() });
}
