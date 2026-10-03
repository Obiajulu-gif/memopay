// Off-chain side of contracts/contracts/MemoPayInvoices.sol: typed data, call encoding, ABI.
import { encodeFunctionData, parseAbi, type Hex } from 'viem';

export const settlementAbi = parseAbi([
  'struct Invoice { bytes32 id; address merchant; address token; uint256 amount; bytes32 contentHash; }',
  'struct Authorization { address from; uint256 value; uint256 validAfter; uint256 validBefore; bytes32 nonce; uint8 v; bytes32 r; bytes32 s; }',
  'function pay(Invoice inv, bytes merchantSig, Authorization auth)',
  'function cancel(bytes32 id)',
  'function statusOf(address merchant, bytes32 id) view returns (uint8)',
  'function hashInvoice(Invoice inv) view returns (bytes32)',
  'function usdc() view returns (address)',
  'function eurc() view returns (address)',
  'event InvoicePaid(bytes32 indexed id, address indexed merchant, address indexed payer, address token, uint256 amount, bytes32 contentHash)',
  'event InvoiceCancelled(bytes32 indexed id, address indexed merchant)',
  'error UnsupportedToken(address token)',
  'error InvoiceNotOpen(bytes32 id)',
  'error BadMerchantSignature()',
  'error AmountMismatch()',
  'error TransferFailed()',
  'error NotPayer()',
  'error AuthorizationNotForInvoice()',
]);

export const STATUS = { Open: 0, Paid: 1, Cancelled: 2 } as const;

export type SettlementInvoice = { id: Hex; merchant: Hex; token: Hex; amount: bigint; contentHash: Hex };

/// What the merchant signs when creating an invoice (no gas). Domain binds chain and contract.
export function invoiceTypedData(contract: Hex, chainId: number, inv: SettlementInvoice) {
  return {
    domain: { name: 'MemoPay', version: '1', chainId, verifyingContract: contract },
    types: {
      Invoice: [
        { name: 'id', type: 'bytes32' },
        { name: 'merchant', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'contentHash', type: 'bytes32' },
      ],
    },
    primaryType: 'Invoice' as const,
    message: inv,
  };
}

/// EIP-3009 ReceiveWithAuthorization the payer signs, paying exactly `value` to the settlement contract.
export function receiveAuthTypedData(p: {
  token: Hex;
  tokenName: string; // the token's name() — "USDC" / "EURC" on Arc
  chainId: number;
  from: Hex;
  to: Hex;
  value: bigint;
  validBefore: bigint;
  nonce: Hex;
}) {
  return {
    domain: { name: p.tokenName, version: '2', chainId: p.chainId, verifyingContract: p.token },
    types: {
      ReceiveWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'ReceiveWithAuthorization' as const,
    message: { from: p.from, to: p.to, value: p.value, validAfter: 0n, validBefore: p.validBefore, nonce: p.nonce },
  };
}

export function splitSig(sig: Hex): { r: Hex; s: Hex; v: number } {
  if (sig.length !== 132) throw new Error('Expected a 65-byte signature');
  const r = `0x${sig.slice(2, 66)}` as Hex;
  const s = `0x${sig.slice(66, 130)}` as Hex;
  let v = parseInt(sig.slice(130, 132), 16);
  if (v < 27) v += 27;
  return { r, s, v };
}

export type SignedAuth = { from: Hex; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex; signature: Hex };

export function payCallData(inv: SettlementInvoice, merchantSig: Hex, auth: SignedAuth): Hex {
  const { r, s, v } = splitSig(auth.signature);
  return encodeFunctionData({
    abi: settlementAbi,
    functionName: 'pay',
    args: [
      inv,
      merchantSig,
      { from: auth.from, value: auth.value, validAfter: auth.validAfter, validBefore: auth.validBefore, nonce: auth.nonce, v, r, s },
    ],
  });
}
