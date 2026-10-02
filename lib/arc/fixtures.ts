// Test helpers: build fake receipts carrying Memo events.
import { encodeAbiParameters, encodeEventTopics, keccak256, type Log, type TransactionReceipt } from 'viem';
import { memoAbi } from './abi';
import type { Hex } from './config';

export function memoLog(o: { emitter: Hex; sender: Hex; target: Hex; callDataHash: Hex; memoId: Hex }): Log {
  const topics = encodeEventTopics({
    abi: memoAbi,
    eventName: 'Memo',
    args: { sender: o.sender, target: o.target, memoId: o.memoId },
  });
  const data = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes' }, { type: 'uint256' }],
    [o.callDataHash, '0x6d656d6f', 1n],
  );
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
