'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createPublicClient, custom, formatUnits, type WalletClient } from 'viem';
import { erc20Abi, memoAbi } from '@/lib/arc/abi';
import { clientNetwork, connectWallet, explorerUrl, walletError } from '@/lib/arc/browser';
import { arcChain, arcConfig, type Currency, type Hex } from '@/lib/arc/config';
import { memoCallArgs } from '@/lib/arc/encode';
import { formatAmount, shortAddr } from '@/lib/format';

type PayInvoice = { id: string; number: string; content_hash: string; merchant: string; amount: string; currency: Currency };

type Ready = { wallet: WalletClient; address: Hex; tokenBalance: bigint; gasBalance: bigint; feeUsd: string; maxFeePerGas: bigint };
type State =
  | { step: 'idle' }
  | { step: 'connecting' }
  | ({ step: 'ready' } & Ready)
  | { step: 'paying' | 'confirming' }
  | { step: 'claiming' | 'claim_failed'; tx: Hex }
  | { step: 'done'; tx: Hex };

const MIN_FEE = 20_000_000_000n; // Arc mempool floor: 20 gwei

export default function PayButton({ invoice }: { invoice: PayInvoice }) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const network = clientNetwork();
  const cfg = arcConfig(network);
  const token = cfg.tokens[invoice.currency];
  const amount = BigInt(invoice.amount);
  const args = memoCallArgs({ ...invoice, amount }, token);
  const reader = () => createPublicClient({ chain: arcChain(network), transport: custom(window.ethereum!) });

  async function connect() {
    setError(null);
    setState({ step: 'connecting' });
    try {
      const { wallet, address } = await connectWallet(network);
      const pc = reader();
      const [tokenBalance, gasBalance, fees] = await Promise.all([
        pc.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
        pc.getBalance({ address }),
        pc.estimateFeesPerGas(),
      ]);
      const maxFeePerGas = fees.maxFeePerGas > MIN_FEE ? fees.maxFeePerGas : MIN_FEE;
      let feeUsd = '≈ $0.001';
      try {
        const gas = await pc.estimateContractGas({ address: cfg.memo, abi: memoAbi, functionName: 'memo', args, account: address });
        feeUsd = `≈ $${Number(formatUnits(gas * maxFeePerGas, 18)).toFixed(4)}`;
      } catch {
        // Estimation fails when the balance is too low; the balance check below explains why.
      }
      setState({ step: 'ready', wallet, address, tokenBalance, gasBalance, feeUsd, maxFeePerGas });
    } catch (e) {
      setError(walletError(e));
      setState({ step: 'idle' });
    }
  }

  async function claim(tx: Hex) {
    setState({ step: 'claiming', tx });
    // The server's RPC may lag the wallet's by a moment, so retry a few times.
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`/api/invoices/${invoice.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: tx }),
      }).catch(() => null);
      const body = await res?.json().catch(() => ({}));
      if (res?.ok && (body.status === 'paid' || body.status === 'already_paid')) {
        setState({ step: 'done', tx });
        return;
      }
      if (res?.ok) {
        setError(`Payment was sent but did not match this invoice (${body.reason ?? body.status}). Contact the sender.`);
        setState({ step: 'claim_failed', tx });
        return;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    setError('Your payment is on-chain, but we could not confirm it yet.');
    setState({ step: 'claim_failed', tx });
  }

  async function pay() {
    if (state.step !== 'ready') return;
    setError(null);
    const { wallet, address, maxFeePerGas } = state;
    setState({ step: 'paying' });
    try {
      const tx = await wallet.writeContract({
        address: cfg.memo,
        abi: memoAbi,
        functionName: 'memo',
        args,
        account: address,
        chain: arcChain(network),
        maxFeePerGas,
        maxPriorityFeePerGas: 1n,
      });
      setState({ step: 'confirming' });
      const receipt = await reader().waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== 'success') {
        setError('The transaction reverted. Nothing was paid. You can try again.');
        setState({ step: 'idle' });
        return;
      }
      await claim(tx);
    } catch (e) {
      setError(walletError(e) === 'Request cancelled in wallet' ? 'Payment cancelled' : walletError(e));
      setState({ step: 'idle' });
    }
  }

  const txLink = (tx: Hex) => (
    <a className="mono" href={`${explorerUrl(network)}/tx/${tx}`} target="_blank" rel="noreferrer">{shortAddr(tx)}</a>
  );

  if (state.step === 'done') {
    return (
      <div className="stack">
        <div className="alert alert-ok"><strong>Paid.</strong> Transaction {txLink(state.tx)} is final on Arc.</div>
        <Link className="btn" href={`/r/${invoice.id}`}>View receipt</Link>
      </div>
    );
  }

  if (state.step === 'claiming' || state.step === 'claim_failed') {
    return (
      <div className="stack">
        <div className="alert alert-info">Payment sent: {txLink(state.tx)}. {state.step === 'claiming' ? 'Confirming with MemoPay…' : ''}</div>
        {error && <div className="alert alert-error">{error}</div>}
        {state.step === 'claim_failed' && <button className="btn" onClick={() => claim(state.tx)}>Retry confirmation</button>}
      </div>
    );
  }

  let blocked: string | null = null;
  if (state.step === 'ready') {
    if (state.tokenBalance < amount) blocked = `Not enough ${invoice.currency}: you have ${formatAmount(state.tokenBalance, invoice.currency)}.`;
    else if (state.gasBalance === 0n) blocked = 'You need a little USDC on Arc for the network fee.';
  }

  return (
    <div className="stack">
      {state.step === 'idle' || state.step === 'connecting' ? (
        <button className="btn btn-primary btn-lg" onClick={connect} disabled={state.step === 'connecting'}>
          {state.step === 'connecting' ? 'Connecting…' : 'Connect wallet to pay'}
        </button>
      ) : state.step === 'ready' ? (
        <>
          <div className="spread small">
            <span className="muted">Paying from <span className="mono">{shortAddr(state.address)}</span></span>
            <span className="muted">Network fee {state.feeUsd} (USDC)</span>
          </div>
          <button className="btn btn-primary btn-lg" onClick={pay} disabled={!!blocked}>
            Pay {formatAmount(amount, invoice.currency)}
          </button>
          {blocked && <div className="alert alert-error">{blocked}</div>}
        </>
      ) : (
        <button className="btn btn-primary btn-lg" disabled>
          {state.step === 'paying' ? 'Confirm in your wallet…' : 'Finalizing on Arc…'}
        </button>
      )}
      {error && state.step !== 'ready' && <div className="alert alert-error">{error}</div>}
      <p className="muted small">Use a regular wallet such as MetaMask or Rabby. Smart-contract wallets can&apos;t pay through the Memo contract.</p>
    </div>
  );
}
