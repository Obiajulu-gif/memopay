'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BaseError, ContractFunctionRevertedError, createPublicClient, custom, formatUnits, toHex, type WalletClient } from 'viem';
import { erc20Abi, memoAbi } from '@/lib/arc/abi';
import { clientNetwork, connectWallet, explorerUrl, walletError } from '@/lib/arc/browser';
import { arcChain, arcConfig, type Currency, type Hex } from '@/lib/arc/config';
import { memoDataFor, memoIdFor } from '@/lib/arc/encode';
import { payCallData, receiveAuthTypedData, settlementAbi } from '@/lib/arc/settlement';
import { formatAmount, shortAddr } from '@/lib/format';

type PayInvoice = {
  id: string;
  number: string;
  content_hash: string;
  merchant: string;
  amount: string;
  currency: Currency;
  merchant_sig: string;
  settlement: string;
};

type Ready = { wallet: WalletClient; address: Hex; tokenBalance: bigint; gasBalance: bigint; tokenName: string; maxFeePerGas: bigint };
type State =
  | { step: 'idle' }
  | { step: 'connecting' }
  | ({ step: 'ready' } & Ready)
  | { step: 'authorizing' | 'paying' | 'confirming' }
  | { step: 'claiming' | 'claim_failed'; tx: Hex }
  | { step: 'done'; tx: Hex };

const MIN_FEE = 20_000_000_000n; // Arc mempool floor: 20 gwei

const CONTRACT_ERRORS: Record<string, string> = {
  InvoiceNotOpen: 'This invoice is already paid or was cancelled. Nothing was charged.',
  BadMerchantSignature: "This invoice's signature doesn't match. Ask the sender for a new link.",
  AmountMismatch: 'The authorized amount does not match the invoice.',
  UnsupportedToken: 'This invoice uses a token MemoPay does not accept.',
};

// Fresh EIP-3009 nonce and a one-hour validity window for the payer's authorization.
function authWindow(): { nonce: Hex; validBefore: bigint } {
  return { nonce: toHex(crypto.getRandomValues(new Uint8Array(32))), validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600) };
}

function revertReason(e: unknown): string | null {
  if (!(e instanceof BaseError)) return null;
  const reverted = e.walk(err => err instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
  const name = reverted?.data?.errorName;
  return name ? CONTRACT_ERRORS[name] ?? `The payment was rejected (${name}).` : null;
}

export default function PayButton({ invoice }: { invoice: PayInvoice }) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const network = clientNetwork();
  const cfg = arcConfig(network);
  const chain = arcChain(network);
  const token = cfg.tokens[invoice.currency];
  const amount = BigInt(invoice.amount);
  const settlement = invoice.settlement as Hex;
  const terms = {
    id: memoIdFor(invoice.id),
    merchant: invoice.merchant as Hex,
    token,
    amount,
    contentHash: invoice.content_hash as Hex,
  };
  const reader = () => createPublicClient({ chain, transport: custom(window.ethereum!) });

  async function connect() {
    setError(null);
    setState({ step: 'connecting' });
    try {
      const { wallet, address } = await connectWallet(network);
      const pc = reader();
      const [tokenBalance, gasBalance, tokenName, fees] = await Promise.all([
        pc.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
        pc.getBalance({ address }),
        pc.readContract({ address: token, abi: erc20Abi, functionName: 'name' }),
        pc.estimateFeesPerGas(),
      ]);
      const maxFeePerGas = fees.maxFeePerGas > MIN_FEE ? fees.maxFeePerGas : MIN_FEE;
      setState({ step: 'ready', wallet, address, tokenBalance, gasBalance, tokenName, maxFeePerGas });
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
      await new Promise(r => setTimeout(r, 1500));
    }
    setError('Your payment is final on Arc, but MemoPay could not confirm it yet.');
    setState({ step: 'claim_failed', tx });
  }

  async function pay() {
    if (state.step !== 'ready') return;
    setError(null);
    const { wallet, address, tokenName, maxFeePerGas } = state;
    try {
      // 1. Payer authorizes exactly this amount to the settlement contract (signature, no gas).
      setState({ step: 'authorizing' });
      const { nonce, validBefore } = authWindow();
      const authSig = await wallet.signTypedData({
        account: address,
        ...receiveAuthTypedData({ token, tokenName, chainId: chain.id, from: address, to: settlement, value: amount, validBefore, nonce }),
      });

      // 2. One transaction: Arc's Memo contract attaches the invoice memo and calls the settlement contract.
      const data = payCallData(terms, invoice.merchant_sig as Hex, { from: address, value: amount, validAfter: 0n, validBefore, nonce, signature: authSig });
      const args = [settlement, data, terms.id, memoDataFor(invoice.number, invoice.content_hash)] as const;
      const pc = reader();
      await pc.simulateContract({ address: cfg.memo, abi: [...memoAbi, ...settlementAbi], functionName: 'memo', args, account: address });

      setState({ step: 'paying' });
      const tx = await wallet.writeContract({
        address: cfg.memo,
        abi: memoAbi,
        functionName: 'memo',
        args,
        account: address,
        chain,
        maxFeePerGas,
        maxPriorityFeePerGas: 1n,
      });
      setState({ step: 'confirming' });
      const receipt = await pc.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== 'success') {
        setError('The transaction reverted. Nothing was paid. You can try again.');
        setState({ step: 'idle' });
        return;
      }
      await claim(tx);
    } catch (e) {
      const reason = revertReason(e);
      const msg = reason ?? walletError(e);
      setError(msg === 'Request cancelled in wallet' ? 'Payment cancelled' : msg);
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
    else if (invoice.currency === 'USDC' && state.tokenBalance === amount) blocked = 'Keep a little extra USDC for the network fee (about $0.001).';
  }

  const busyLabel: Record<string, string> = {
    authorizing: 'Approve the amount in your wallet…',
    paying: 'Confirm the payment in your wallet…',
    confirming: 'Finalizing on Arc…',
  };

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
            {/* ponytail: fixed 250k gas estimate for memo+pay; simulate for an exact figure if it matters */}
            <span className="muted">Network fee ≈ ${Number(formatUnits(250_000n * state.maxFeePerGas, 18)).toFixed(3)} in USDC</span>
          </div>
          <button className="btn btn-primary btn-lg" onClick={pay} disabled={!!blocked}>
            Pay {formatAmount(amount, invoice.currency)}
          </button>
          {blocked && <div className="alert alert-error">{blocked}</div>}
          <p className="muted small">
            Your wallet asks twice: first to approve exactly {formatAmount(amount, invoice.currency)} for this invoice (free), then to send the payment.
          </p>
        </>
      ) : (
        <button className="btn btn-primary btn-lg" disabled>{busyLabel[state.step]}</button>
      )}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <p className="muted small">Use a regular wallet such as MetaMask or Rabby. Smart-contract wallets can&apos;t pay through the Memo contract.</p>
    </div>
  );
}
