// Test helpers: build fake receipts carrying settlement events.
import { encodeAbiParameters, encodeEventTopics, keccak256, type Log, type TransactionReceipt } from 'viem';
import { settlementAbi } from './settlement';
import type { Hex } from './config';

export function paidLog(o: { emitter: Hex; id: Hex; merchant: Hex; payer: Hex; token: Hex; amount: bigint; contentHash: Hex }): Log {
  const topics = encodeEventTopics({
    abi: settlementAbi,
    eventName: 'InvoicePaid',
    args: { id: o.id, merchant: o.merchant, payer: o.payer },
  });
  const data = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }], [o.token, o.amount, o.contentHash]);
  return { address: o.emitter, topics, data } as unknown as Log;
}

export function makeReceipt(o: { status?: 'success' | 'reverted'; logs: Log[]; block?: bigint; hash?: Hex }): TransactionReceipt {
  return {
    status: o.status ?? 'success',
    logs: o.logs,
    blockNumber: o.block ?? 123n,
    transactionHash: o.hash ?? keccak256('0x01'),
  } as unknown as TransactionReceipt;
}
