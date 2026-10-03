// End-to-end check of the app's signing/encoding code against the compiled contract on a local chain.
// Start a node first:  npx hardhat node --port 8546 --chain-id 5042002
// Then from the repo root:  npx tsx contracts/scripts/e2e-local.mts
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, keccak256, toBytes, toHex, type Abi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { invoiceTypedData, payCallData, receiveAuthTypedData, settlementAbi } from '../../lib/arc/settlement.ts';
import { verifySettlement } from '../../lib/arc/verify.ts';

const art = (p: string) => JSON.parse(readFileSync(new URL(`../artifacts/contracts/${p}`, import.meta.url), 'utf8'));
const token = art('test/MockFiatToken.sol/MockFiatToken.json');
const settlement = art('MemoPayInvoices.sol/MemoPayInvoices.json');

// Hardhat's well-known local test keys (accounts #0 and #1); never used on a real network.
const deployer = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const payer = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const merchant = privateKeyToAccount(keccak256(toBytes('e2e-merchant')));

const chain = { id: 5042002, name: 'local', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1:8546'] } } } as const;
const pc = createPublicClient({ chain, transport: http() });
const wallet = (account: typeof deployer) => createWalletClient({ chain, transport: http(), account });

async function deploy(a: { abi: Abi; bytecode: Hex }, args: unknown[]): Promise<Hex> {
  const hash = await wallet(deployer).deployContract({ abi: a.abi, bytecode: a.bytecode, args });
  return (await pc.waitForTransactionReceipt({ hash })).contractAddress!;
}

const usdc = await deploy(token, ['USDC']);
const eurc = await deploy(token, ['EURC']);
const contract = await deploy(settlement, [usdc, eurc]);
await pc.waitForTransactionReceipt({ hash: await wallet(deployer).writeContract({ address: usdc, abi: token.abi, functionName: 'mint', args: [payer.address, 1_000_000n] }) });

// Merchant signs terms exactly as NewInvoiceForm does.
const terms = { id: keccak256(toBytes('memopay:v1:e2e')), merchant: merchant.address, token: usdc, amount: 50_000n, contentHash: keccak256(toBytes('e2e-content')) };
const merchantSig = await merchant.signTypedData(invoiceTypedData(contract, chain.id, terms));

// Payer authorizes exactly as PayButton does (token name from the chain).
const tokenName = (await pc.readContract({ address: usdc, abi: token.abi, functionName: 'name' })) as string;
const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
const authSig = await payer.signTypedData(receiveAuthTypedData({ token: usdc, tokenName, chainId: chain.id, from: payer.address, to: contract, value: 50_000n, validBefore, nonce }));

// On Arc this calldata goes through Memo.memo(contract, data, …); locally we call the contract directly.
const data = payCallData(terms, merchantSig, { from: payer.address, value: 50_000n, validAfter: 0n, validBefore, nonce, signature: authSig });
const hash = await wallet(payer).sendTransaction({ to: contract, data });
const receipt = await pc.waitForTransactionReceipt({ hash });

const result = verifySettlement(receipt, { settlement: contract, id: terms.id, merchant: merchant.address, token: usdc, amount: 50_000n, contentHash: terms.contentHash });
const merchantBal = await pc.readContract({ address: usdc, abi: token.abi, functionName: 'balanceOf', args: [merchant.address] });
const status = await pc.readContract({ address: contract, abi: settlementAbi, functionName: 'statusOf', args: [merchant.address, terms.id] });

// Second attempt must revert (paid once).
let secondReverted = false;
try {
  await pc.call({ to: contract, data, account: payer.address });
} catch {
  secondReverted = true;
}

console.log(JSON.stringify({ receipt: receipt.status, verify: result, merchantBalance: merchantBal.toString(), status: Number(status), secondReverted }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const ok = receipt.status === 'success' && result.ok && result.payer === payer.address.toLowerCase() && merchantBal === 50_000n && Number(status) === 1 && secondReverted;
console.log(ok ? 'E2E PASS' : 'E2E FAIL');
process.exit(ok ? 0 : 1);
