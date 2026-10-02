import { describe, expect, it } from 'vitest';
import type { PublicClient } from 'viem';
import { chunkRanges, findMemoTxHashes } from './scan';

describe('chunkRanges', () => {
  it('returns one range when from equals to', () => {
    expect(chunkRanges(100n, 100n, 10n)).toEqual([[100n, 100n]]);
  });

  it('splits inclusive ranges', () => {
    expect(chunkRanges(0n, 25n, 10n)).toEqual([[0n, 9n], [10n, 19n], [20n, 25n]]);
  });

  it('returns nothing when from is after to', () => {
    expect(chunkRanges(5n, 4n, 10n)).toEqual([]);
  });

  it('covers every block exactly once', () => {
    for (let i = 0; i < 200; i++) {
      const from = BigInt(Math.floor(Math.random() * 1000));
      const to = from + BigInt(Math.floor(Math.random() * 300));
      const size = BigInt(1 + Math.floor(Math.random() * 50));
      const seen: bigint[] = [];
      for (const [a, b] of chunkRanges(from, to, size)) {
        expect(b - a + 1n <= size).toBe(true);
        for (let x = a; x <= b; x++) seen.push(x);
      }
      expect(seen.length).toBe(Number(to - from + 1n));
      seen.forEach((x, j) => expect(x).toBe(from + BigInt(j)));
    }
  });
});

describe('findMemoTxHashes', () => {
  it('queries once per chunk and dedupes tx hashes', async () => {
    const calls: Array<[bigint, bigint]> = [];
    const client = {
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        calls.push([fromBlock, toBlock]);
        return [{ transactionHash: '0xaa' }];
      },
    } as unknown as PublicClient;
    const hashes = await findMemoTxHashes(client, '0x5294E9927c3306DcBaDb03fe70b92e01cCede505', '0x01', 0n, 25n, 10n);
    expect(calls).toEqual([[0n, 9n], [10n, 19n], [20n, 25n]]);
    expect(hashes).toEqual(['0xaa']);
  });
});
