# MemoPay

**Invoice links that reconcile themselves, on Arc.**

A freelancer or small business creates an invoice and shares a link. The client pays in USDC or EURC on Arc with one transaction. That transaction goes through Arc's predeployed `Memo` contract, which attaches the invoice ID to the transfer on-chain. MemoPay's server reads the `Memo` event, proves the right amount of the right token reached the right merchant, and marks the invoice paid, usually within a second of the payment.

No reference fields to type, no matching bank lines to invoices by hand.

## Why Arc

| Arc feature | How MemoPay uses it |
|---|---|
| **Memo contract** `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | Wraps the token `transfer` and emits `Memo(sender, target, callDataHash, memoId, memo, memoIndex)`. `memoId` identifies the invoice; the payer stays `msg.sender` for the transfer, so no `approve` step is needed. |
| **USDC as gas** | The client needs one asset. Fees are shown in dollars before paying (~$0.001). |
| **EURC native** `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | Invoices can be in euros. |
| **Deterministic sub-second finality** | "Paid" is final the moment the receipt arrives. No confirmation counting. |

## How verification works

Every invoice gets:

- `memo_id = keccak256("memopay:v1:" + invoiceId)`
- `content_hash = keccak256(canonical JSON of the invoice)`, sent in `memoData` as `memopay:v1:<number>:<content_hash>`, so the explorer shows which invoice version was paid.

The pay page sends:

```
Memo.memo(token, transfer(merchant, amount), memo_id, memoData)
```

The server never trusts the browser. Given a transaction hash it fetches the receipt from Arc and requires:

1. `status == success`;
2. a `Memo` event emitted by the Memo contract with this invoice's `memoId` (the contract only emits it after the inner transfer succeeds);
3. `target` equal to the invoice currency's token;
4. `callDataHash` equal to `keccak256(transfer(merchant, amount))`.

Together these prove amount, token and recipient without parsing transfer logs. The invoice is marked paid with a conditional update (`where status = 'open'`), so it can't be marked paid twice. Payments that carry the invoice's `memoId` but don't match are kept and shown to the merchant as mismatched (`wrong_token`, `wrong_amount_or_recipient`, `duplicate`, `invoice_void`).

If the client closes the tab before the app confirms, the merchant's invoice page rechecks automatically: it scans Arc logs for the `memoId` from the block the invoice was created at, in 10,000-block chunks.

Code: [`lib/arc/verify.ts`](lib/arc/verify.ts), [`lib/arc/scan.ts`](lib/arc/scan.ts), [`lib/payments/record.ts`](lib/payments/record.ts).

## Mainnet proof

Added after the mainnet smoke test:

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

Database: create a Supabase project and run [`db/schema.sql`](db/schema.sql) in its SQL editor, then put the pooler connection string in `DATABASE_URL`.

For a database without any account, run Postgres in WebAssembly:

```bash
npx pglite-server -d ./.pglite -p 54329 -m 10
# DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres
```

and apply `db/schema.sql` to it once.

Set `ARC_NETWORK` and `NEXT_PUBLIC_ARC_NETWORK` to `testnet` (chain 5042002, faucet: https://faucet.circle.com) or `mainnet` (chain 5042).

## Stack

Next.js 16 (App Router), viem, Postgres (`postgres`), zod, jose, vitest. No custom smart contract.

## What's next

- Partial payments
- Card or bank payments with Arc App Kit Onramp
- Paying from other chains with Unified Balance / Gateway
- Sending invoices by email
- Team accounts
- On-chain invoice registry
- Nigerian NRS e-invoice reference (IRN) in `memoData`
- Refunds
- Smart-contract-wallet payers
