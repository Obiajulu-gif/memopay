# MemoPay

**Invoice links that reconcile themselves, on Arc.**

A freelancer or small business creates an invoice and shares a link. The client pays in USDC or EURC on Arc with one transaction. That transaction goes through Arc's predeployed `Memo` contract, which attaches the invoice ID to the transfer on-chain. MemoPay's server reads the `Memo` event, proves the right amount of the right token reached the right merchant, and marks the invoice paid, usually within a second of the payment.

No reference fields to type, no matching bank lines to invoices by hand.

## Why Arc

| Arc feature | How MemoPay uses it |
|---|---|
| **Memo contract** `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | Every payment is sent as `Memo.memo(MemoPayInvoices, pay(...), memoId, memoData)`, so the invoice reference is attached to the transaction on-chain. |
| **USDC as gas** | The client needs one asset. Fees are a fraction of a cent, paid in USDC. |
| **EURC native** `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | Invoices can be in euros. |
| **Circle FiatToken v2 (EIP-3009)** | The payer authorizes exactly the invoice amount with `receiveWithAuthorization`; no open-ended approvals. |
| **Deterministic sub-second finality** | "Paid" is final the moment the receipt arrives. |

## The settlement contract

[`contracts/contracts/MemoPayInvoices.sol`](contracts/contracts/MemoPayInvoices.sol) enforces the invoice on-chain:

1. **Merchant signs the terms** when creating an invoice: `Invoice(id, merchant, token, amount, contentHash)` as EIP-712 typed data, bound to the chain and contract. Free, no transaction.
2. **Payer signs an EIP-3009 `ReceiveWithAuthorization`** for exactly the amount, payable only to the contract. Free.
3. **One transaction** through Arc's Memo contract calls `pay(invoice, merchantSig, authorization)`. The contract:
   - accepts only USDC or EURC;
   - refuses invoices already paid or cancelled by their merchant;
   - checks the merchant's signature (rejecting malleable signatures and other chains);
   - requires the authorization to equal the signed amount;
   - pulls the funds and forwards them to the merchant in the same transaction, then emits `InvoicePaid`.
4. **Merchant can `cancel(id)`** an open invoice; the app's Void button does this before voiding.

The contract has no owner, no admin functions, and never holds funds between transactions. Tokens sent to it directly, outside `pay`, can't be recovered.

The payer's authorization nonce is the invoice's EIP-712 digest and only the payer may submit `pay`, so a copied authorization can't be redirected to another invoice and a copied transaction can't be front-run.

Tests: 19 Solidity tests (Hardhat 3, forge-std) cover payment, double payment, wrong amount, tampered terms, redirected recipient, foreign signer, high-s signatures, cross-chain replay, unsupported tokens, failed transfers, cancellation, front-running by a third party and reuse of an authorization for another invoice. A shared test vector proves the app's viem signing hashes exactly like the contract, and [`contracts/scripts/e2e-local.mts`](contracts/scripts/e2e-local.mts) runs the app's signing and verification code against the compiled contract on a local chain.

```bash
cd contracts
npm install
npm test                     # Solidity tests
npm run build && npm run export   # refresh lib/arc/settlement-artifact.json for the app
```

## How verification works

The server never trusts the browser. Given a transaction hash it fetches the receipt from Arc and looks for `InvoicePaid` from the invoice's settlement contract with this invoice's `id` and merchant, then checks token, amount and content hash against the stored invoice. Because the contract only emits `InvoicePaid` after moving exactly the signed amount to the merchant, that event is proof of payment. The invoice is marked paid with a conditional update (`where status = 'open'`).

If the client closes the tab before the app confirms, the merchant's invoice page rechecks automatically by scanning Arc for `InvoicePaid` events with the invoice's `id`.

Code: [`lib/arc/settlement.ts`](lib/arc/settlement.ts), [`lib/arc/verify.ts`](lib/arc/verify.ts), [`lib/arc/scan.ts`](lib/arc/scan.ts), [`lib/payments/record.ts`](lib/payments/record.ts).

## Mainnet proof

Added after the mainnet smoke test:

- MemoPayInvoices contract: [`0x4bce44e8e6bf80971886521cdf9b1e3ae472fcbd`](https://explorer.arc.io/address/0x4bce44e8e6bf80971886521cdf9b1e3ae472fcbd) on Arc mainnet. Runtime bytecode matches `contracts/contracts/MemoPayInvoices.sol` compiled with solc 0.8.28 (optimizer 200 runs, Cancun), including metadata hash.
- USDC invoice payment: _pending_
- EURC invoice payment: _pending_

## Features

- Wallet sign-in (signed message, no password)
- Create invoices in USDC or EURC with line items; amounts parsed exactly (no floats)
- Share link and QR code
- One-click pay page with balance and network checks
- Server-side on-chain verification, automatic recheck
- Mismatched and duplicate payments surfaced to the merchant
- Dashboard with paid and outstanding totals, CSV export
- Printable receipt with transaction, memo ID and content hash

The payer must use a regular wallet (an EOA such as MetaMask, Rabby or a hardware wallet). Arc's Memo contract doesn't accept calls from smart-contract wallets.

## Run locally

Requirements: Node 20+.

```bash
npm install
cp .env.example .env.local   # fill in values
npm test
npm run dev
```

Database: create a [Neon](https://neon.tech) project, run [`db/schema.sql`](db/schema.sql) in its SQL editor, then put the pooled connection string in `DATABASE_URL`. Any Postgres works.

For a database without any account, run Postgres in WebAssembly:

```bash
npx pglite-server -d ./.pglite -p 54329 -m 10
# DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres
```

and apply `db/schema.sql` to it once.

Set `ARC_NETWORK` and `NEXT_PUBLIC_ARC_NETWORK` to `testnet` (chain 5042002, faucet: https://faucet.circle.com) or `mainnet` (chain 5042).

## Stack

Next.js 16 (App Router), viem, Neon Postgres (`postgres`), zod, jose, vitest. Solidity 0.8.28 with Hardhat 3.

## What's next

- Partial payments
- Card or bank payments with Arc App Kit Onramp
- Paying from other chains with Unified Balance / Gateway
- Sending invoices by email
- Team accounts
- Nigerian NRS e-invoice reference (IRN) in `memoData`
- Refunds
- Smart-contract-wallet payers
