// Browser-only wallet helpers built on viem (no wallet library needed for one injected wallet).
import { createWalletClient, custom, type EIP1193Provider, type WalletClient } from 'viem';
import { arcChain, arcConfig, type ArcNetwork, type Hex } from './config';

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const clientNetwork = (): ArcNetwork =>
  process.env.NEXT_PUBLIC_ARC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export async function connectWallet(network: ArcNetwork = clientNetwork()): Promise<{ wallet: WalletClient; address: Hex }> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet found. Install MetaMask or Rabby and reload.');
  }
  const wallet = createWalletClient({ chain: arcChain(network), transport: custom(window.ethereum) });
  const [address] = await wallet.requestAddresses();
  await ensureArcChain(wallet, network);
  return { wallet, address };
}

export async function ensureArcChain(wallet: WalletClient, network: ArcNetwork): Promise<void> {
  const chain = arcChain(network);
  if ((await wallet.getChainId()) === chain.id) return;
  try {
    await wallet.switchChain({ id: chain.id });
  } catch (e) {
    const code = (e as { code?: number; cause?: { code?: number } }).code ?? (e as { cause?: { code?: number } }).cause?.code;
    if (code !== 4902) throw e;
    await wallet.addChain({ chain });
    await wallet.switchChain({ id: chain.id });
  }
}

export function walletError(e: unknown): string {
  const err = e as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } };
  if (err.code === 4001 || err.cause?.code === 4001 || /reject|denied/i.test(err.message ?? '')) return 'Request cancelled in wallet';
  return err.shortMessage ?? err.message ?? 'Something went wrong';
}

export const explorerUrl = (network: ArcNetwork = clientNetwork()) => arcConfig(network).explorer;
