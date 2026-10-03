'use client';

import { useState } from 'react';
import { createPublicClient, custom, type Abi } from 'viem';
import { clientNetwork, connectWallet, explorerUrl, walletError } from '@/lib/arc/browser';
import { arcChain, arcConfig, type Hex } from '@/lib/arc/config';
import { settlementAbi } from '@/lib/arc/settlement';
import artifact from '@/lib/arc/settlement-artifact.json';

type Result = { address: Hex; tx: Hex; usdc: Hex; eurc: Hex };

export default function DeployContract({ configured }: { configured: string | null }) {
  const network = clientNetwork();
  const cfg = arcConfig(network);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function deploy() {
    setBusy(true);
    setError(null);
    try {
      const chain = arcChain(network);
      const { wallet, address } = await connectWallet(network);
      const pc = createPublicClient({ chain, transport: custom(window.ethereum!) });
      const { maxFeePerGas: est } = await pc.estimateFeesPerGas();
      const tx = await wallet.deployContract({
        abi: artifact.abi as Abi,
        bytecode: artifact.bytecode as Hex,
        args: [cfg.tokens.USDC, cfg.tokens.EURC],
        account: address,
        chain,
        maxFeePerGas: est > 20_000_000_000n ? est : 20_000_000_000n, // Arc floor: 20 gwei
        maxPriorityFeePerGas: 1n,
      });
      const receipt = await pc.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment reverted');
      const deployed = receipt.contractAddress;
      // Read the constructor arguments back from the chain to prove the deployment is wired to Arc's tokens.
      const [usdc, eurc] = await Promise.all([
        pc.readContract({ address: deployed, abi: settlementAbi, functionName: 'usdc' }),
        pc.readContract({ address: deployed, abi: settlementAbi, functionName: 'eurc' }),
      ]);
      setResult({ address: deployed, tx, usdc, eurc });
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {configured && (
        <div className="alert alert-ok">
          This site already uses <a className="mono" href={`${explorerUrl(network)}/address/${configured}`} target="_blank" rel="noreferrer">{configured}</a>.
          Deploy again only if you want a fresh contract.
        </div>
      )}
      <dl className="kv">
        <dt>Network</dt><dd>{network === 'mainnet' ? 'Arc mainnet (chain 5042)' : 'Arc testnet (chain 5042002)'}</dd>
        <dt>USDC</dt><dd className="mono">{cfg.tokens.USDC}</dd>
        <dt>EURC</dt><dd className="mono">{cfg.tokens.EURC}</dd>
        <dt>Cost</dt><dd>A few cents of USDC for gas, paid by your wallet</dd>
      </dl>
      <button className="btn btn-primary btn-lg" onClick={deploy} disabled={busy}>
        {busy ? 'Confirm in your wallet, then wait for Arc…' : 'Deploy MemoPayInvoices'}
      </button>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {result && (
        <div className="alert alert-ok stack">
          <div>
            Deployed at <a className="mono" href={`${explorerUrl(network)}/address/${result.address}`} target="_blank" rel="noreferrer">{result.address}</a>
            {' '}in <a className="mono" href={`${explorerUrl(network)}/tx/${result.tx}`} target="_blank" rel="noreferrer">this transaction</a>.
          </div>
          <div className="small">Contract reports USDC <span className="mono">{result.usdc}</span> and EURC <span className="mono">{result.eurc}</span>.</div>
          <div className="small">
            Next: in Vercel, set <code>NEXT_PUBLIC_SETTLEMENT_CONTRACT</code> to this address for the {network === 'mainnet' ? 'Production' : 'Preview'} environment, then redeploy.
          </div>
        </div>
      )}
    </div>
  );
}
