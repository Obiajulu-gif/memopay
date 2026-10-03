import { parseAbiItem, type PublicClient } from 'viem';
import type { Hex } from './config';

export function chunkRanges(from: bigint, to: bigint, size: bigint): Array<[bigint, bigint]> {
  const out: Array<[bigint, bigint]> = [];
  for (let a = from; a <= to; a += size) {
    const b = a + size - 1n;
    out.push([a, b < to ? b : to]);
  }
  return out;
}

// ponytail: scans from created_block every time; store last_scanned_block per invoice if old invoices get slow.
const invoicePaid = parseAbiItem(
  'event InvoicePaid(bytes32 indexed id, address indexed merchant, address indexed payer, address token, uint256 amount, bytes32 contentHash)',
);

// Transactions in which the settlement contract emitted InvoicePaid for `id`.
export async function findPaidTxHashes(
  client: PublicClient,
  settlement: Hex,
  id: Hex,
  fromBlock: bigint,
  toBlock: bigint,
  chunk: bigint,
): Promise<Hex[]> {
  const hashes = new Set<Hex>();
  for (const [a, b] of chunkRanges(fromBlock, toBlock, chunk)) {
    const logs = await client.getLogs({ address: settlement, event: invoicePaid, args: { id }, fromBlock: a, toBlock: b });
    for (const l of logs) if (l.transactionHash) hashes.add(l.transactionHash);
  }
  return [...hashes];
}
