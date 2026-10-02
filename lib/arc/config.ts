import { createPublicClient, defineChain, fallback, http, type Chain, type PublicClient } from 'viem';

export type Currency = 'USDC' | 'EURC';
export type ArcNetwork = 'mainnet' | 'testnet';
export type Hex = `0x${string}`;

export const CURRENCIES: readonly Currency[] = ['USDC', 'EURC'];

const MEMO: Hex = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505';
const USDC: Hex = '0x3600000000000000000000000000000000000000';

const NETWORKS = {
  mainnet: {
    chainId: 5042,
    name: 'Arc',
    rpcUrls: ['https://rpc.mainnet.arc.io', 'https://rpc.drpc.mainnet.arc.io'],
    explorer: 'https://explorer.arc.io',
    tokens: { USDC, EURC: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1' },
  },
  testnet: {
    chainId: 5042002,
    name: 'Arc Testnet',
    rpcUrls: ['https://rpc.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io'],
    explorer: 'https://explorer.testnet.arc.io',
    tokens: { USDC, EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' },
  },
} as const;

export type ArcConfig = {
  chainId: number;
  name: string;
  rpcUrls: readonly [string, string];
  explorer: string;
  tokens: Record<Currency, Hex>;
  memo: Hex;
};

export function arcConfig(network: ArcNetwork): ArcConfig {
  return { ...NETWORKS[network], memo: MEMO };
}

export function currentNetwork(): ArcNetwork {
  const v = process.env.ARC_NETWORK ?? process.env.NEXT_PUBLIC_ARC_NETWORK ?? 'testnet';
  if (v !== 'mainnet' && v !== 'testnet') throw new Error(`Invalid ARC_NETWORK: ${v}`);
  return v;
}

export function arcChain(network: ArcNetwork): Chain {
  const c = arcConfig(network);
  return defineChain({
    id: c.chainId,
    name: c.name,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [...c.rpcUrls] } },
    blockExplorers: { default: { name: 'Arcscan', url: c.explorer } },
  });
}

export function publicClient(network: ArcNetwork = currentNetwork()): PublicClient {
  const c = arcConfig(network);
  return createPublicClient({
    chain: arcChain(network),
    transport: fallback([http(c.rpcUrls[0]), http(c.rpcUrls[1])]),
  }) as PublicClient;
}

export function explorerTx(network: ArcNetwork, hash: string): string {
  return `${arcConfig(network).explorer}/tx/${hash}`;
}

export function explorerAddress(network: ArcNetwork, address: string): string {
  return `${arcConfig(network).explorer}/address/${address}`;
}
