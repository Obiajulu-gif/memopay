# MemoPay — Design Spec

Date: 2026-10-02
Status: Approved in conversation, awaiting written-spec review
Target: Arc Microgrants (Circle × DoraHacks), deadline 2026-10-14 23:59 ET, aim to submit by 2026-10-08

## 1. Goal

MemoPay lets freelancers and small businesses send an invoice link that a client pays in USDC or EURC on Arc mainnet. Every payment carries the invoice identifier on-chain through Arc's predeployed `Memo` contract, so MemoPay can prove which invoice a payment settles and mark it paid within about a second, with no manual reconciliation.

### Success criteria

- Live on Arc mainnet (chain 5042) at a public Vercel URL.
- A merchant can sign in with a wallet, create a USDC or EURC invoice, and share a link.
- A client can pay that link with one transaction from an EOA wallet, and the invoice shows Paid within a few seconds.
- Paid status is derived only from on-chain data verified server-side.
- Public GitHub repo with README naming the Arc features used and linking at least two real mainnet payment transactions (one USDC, one EURC).
- Two-minute demo video.

### Assumptions

- Solo builder.
- Code is structured so a later PayRun project can reuse `lib/arc`.

## 2. Arc facts this design depends on

| Item | Value |
|---|---|
| Mainnet chain ID | 5042 (testnet 5042002) |
| Primary RPC | `https://rpc.mainnet.arc.io`; fallback `https://rpc.drpc.mainnet.arc.io` |
| Explorer | `https://explorer.arc.io` |
| USDC ERC-20 interface | `0x3600000000000000000000000000000000000000` (6 decimals, same balance as native 18-decimal gas balance) |
| EURC (mainnet) | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` (6 decimals) |
| EURC (testnet) | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Memo contract (both networks) | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` |
| Memo entry point | `memo(address target, bytes data, bytes32 memoId, bytes memoData)` |
| Memo event | `Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)`, emitted only after the inner call succeeds |
| Fee floor | `maxFeePerGas` ≥ 20 gwei |
| Finality | Deterministic, sub-second (~0.5 s blocks, ~7,200 blocks/hour) |

Constraints:

- `Memo` must be called directly by an EOA. Smart-contract wallets (ERC-4337, Safe, Circle SCA wallets) are not supported as payers. The merchant receiving address may be any address.
- `Memo` routes the inner call through the `CallFrom` precompile, so the token contract sees the payer as `msg.sender`. No `approve` is needed.
- A value transfer to `address(0)` reverts on Arc.
- All app amounts use the 6-decimal ERC-20 interface. The native 18-decimal balance is never used for accounting.

## 3. Architecture

A single Next.js (App Router, TypeScript) app on Vercel, with Supabase Postgres for invoice data and viem for Arc. There is no custom smart contract and no background indexer process.

```
memopay/
  lib/arc/        chain config, token map, Memo ABI, encode.ts, verify.ts, scan.ts  (no DB or Next imports)
  lib/db/         SQL queries for merchants, invoices, payments, nonces
  lib/auth/       nonce issue, signature verify, session cookie (jose)
  app/            pages and API routes
  docs/           spec and plan
```

`lib/arc` is pure and depends only on viem, so it can be unit-tested in isolation and reused by PayRun.

Network selection: the env var `ARC_NETWORK=mainnet|testnet` picks the chain ID, RPC URLs and token addresses. Production uses mainnet.

## 4. Data model

```sql
merchants (
  address        text primary key,        -- lowercase 0x address
  display_name   text,
  created_at     timestamptz default now()
)

invoices (
  id              uuid primary key,
  number          text not null,           -- per-merchant sequence, e.g. INV-0001
  merchant        text not null references merchants(address),
  client_name     text not null,
  currency        text not null check (currency in ('USDC','EURC')),
  amount          bigint not null check (amount > 0),   -- 6-decimal units
  line_items      jsonb not null,          -- [{description, quantity, unit_amount}]
  due_date        date,
  memo_id         text not null unique,    -- 0x bytes32
  content_hash    text not null,           -- 0x bytes32
  created_block   bigint not null,
  status          text not null default 'open' check (status in ('open','paid','void')),
  paid_tx         text,
  paid_by         text,
  paid_at         timestamptz,
  created_at      timestamptz default now(),
  unique (merchant, number)
)

payments (
  tx_hash     text primary key,
  invoice_id  uuid not null references invoices(id),
  payer       text not null,
  matched     boolean not null,
  reason      text,                        -- null when matched; else wrong_amount | wrong_token | wrong_recipient | duplicate
  block       bigint not null,
  created_at  timestamptz default now()
)

auth_nonces (
  nonce       text primary key,
  expires_at  timestamptz not null
)
```

Rules:

- Invoices are immutable after creation. The only change allowed is `open → void` (by the owner) and `open → paid` (by verification).
- `amount` equals the sum of `quantity × unit_amount` over line items, computed server-side. Client-sent totals are ignored.
- `content_hash = keccak256(canonical JSON of {number, merchant, client_name, currency, amount, line_items, due_date})`. Canonical JSON uses sorted keys and no whitespace.
- `memo_id = keccak256(utf8("memopay:v1:" + id))`.
- `memoData = utf8("memopay:v1:" + number + ":" + content_hash)`.
- `created_block` is the latest Arc block number read when the invoice is created.

## 5. Pages and API routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Landing page, connect wallet, sign in |
| `/dashboard` | merchant | Invoice list with status, totals per currency, CSV export button |
| `/invoices/new` | merchant | Create invoice form |
| `/invoices/[id]` | merchant (owner) | Invoice detail, share link + QR, payments list including mismatched, Void and Recheck buttons. Runs recheck on load if open. |
| `/pay/[id]` | public | Client pay page |
| `/r/[id]` | public | Printable receipt for a paid invoice (print CSS; browser "Save as PDF") |
| `GET /api/auth/nonce` | public | Issue nonce |
| `POST /api/auth/verify` | public | Verify signature, set session |
| `POST /api/auth/logout` | merchant | Clear session |
| `POST /api/invoices` | merchant | Create invoice |
| `POST /api/invoices/[id]/void` | owner | Void open invoice |
| `POST /api/invoices/[id]/claim` | public, rate-limited | Body `{txHash}`; verify and record |
| `POST /api/invoices/[id]/recheck` | owner | Scan logs and verify any hits |
| `GET /api/invoices/export.csv` | merchant | CSV of the merchant's invoices |

## 6. Payment flow

On `/pay/[id]`:

1. Load the invoice. If `paid`, show the receipt link. If `void`, show a void notice. Neither state shows a pay button.
2. Client connects a wallet (wagmi injected connector). If the chain is not Arc, request `wallet_switchEthereumChain`, falling back to `wallet_addEthereumChain` with Arc params.
3. Read the token `balanceOf(payer)` through the ERC-20 interface. Disable Pay if the balance is less than `amount` plus estimated fee. Show the fee in USD.
4. Send `Memo.memo(token, encodeFunctionData(transfer, [merchant, amount]), memo_id, memoData)` with `maxFeePerGas ≥ 20 gwei`.
5. Wait for the receipt (sub-second), then `POST /api/invoices/[id]/claim {txHash}`. Show Paid on success.
6. If the claim request fails, keep the tx hash on screen with a Retry button.

## 7. Verification (`lib/arc/verify.ts`)

Signature:

```ts
verifyPayment(receipt, expected: { memoId, token, merchant, amount }):
  { ok: true, payer, block } | { ok: false, reason }
```

Steps:

1. `receipt.status` must be `success`. Otherwise `reason = tx_failed`.
2. Decode logs emitted by the Memo contract address with the Memo event ABI. Keep logs whose `memoId == expected.memoId`. If none, `reason = no_memo`.
3. For the matching log:
   - `target` must equal `expected.token`, else `wrong_token`.
   - `callDataHash` must equal `keccak256(encodeFunctionData(transfer, [merchant, amount]))`. If it does not match, decode is not possible from the hash, so `reason = wrong_amount_or_recipient`.
4. Return `ok` with `payer = log.sender` and `block = receipt.blockNumber`.

`reason` values stored in `payments.reason` are therefore: `wrong_token`, `wrong_amount_or_recipient`, `duplicate`. `tx_failed` and `no_memo` are returned to the caller and not stored, because they are not payments for this invoice.

Recording, in the claim route and recheck route:

- If `ok`: run `UPDATE invoices SET status='paid', paid_tx, paid_by, paid_at WHERE id=$1 AND status='open'`. If one row was updated, insert a `payments` row with `matched=true`. If zero rows were updated because the invoice is already paid by a different tx, insert `matched=false, reason='duplicate'`.
- If not `ok` with a storable reason: insert `payments` with `matched=false` and the reason. Invoice stays open.
- `payments.tx_hash` is the primary key, so re-claiming the same tx is a no-op.

## 8. Recheck (`lib/arc/scan.ts`)

`findMemoLogs(memoId, fromBlock, toBlock)` calls `eth_getLogs` on the Memo contract with the Memo event topic and `memoId` as the indexed topic, in chunks of 10,000 blocks (configurable), and returns transaction hashes. The recheck route scans from `created_block` to the latest block, fetches each receipt, and passes it through `verifyPayment` and the recording rules above.

Ceiling: an invoice that has been open for weeks needs many chunks. v1 accepts this, because demo invoices are fresh and the claim path handles the normal case. If it becomes slow, store a `last_scanned_block` per invoice.

## 9. Authentication

1. `GET /api/auth/nonce` creates a 16-byte random nonce stored with a 5-minute expiry.
2. The wallet signs `MemoPay sign-in · <address> · <nonce>` with `personal_sign`.
3. `POST /api/auth/verify {address, nonce, signature}` checks the nonce exists and has not expired, deletes it, verifies the signature with viem `verifyMessage`, upserts the merchant, and sets an httpOnly, Secure, SameSite=Lax cookie holding a `jose` HS256 JWT `{sub: address}` valid for 7 days.
4. Merchant routes read the session and filter all queries by `merchant = session.address`.

## 10. Validation and errors

Input validation (zod, server-side):

- `client_name` 1–100 chars. 1–20 line items. Each description 1–200 chars, quantity an integer 1–1,000, `unit_amount` > 0.
- Total `amount` > 0 and ≤ 10,000 units of the currency (10,000 × 10⁶).
- `currency` is `USDC` or `EURC`. `due_date` optional, not in the past.
- Merchant address must not be the zero address.
- `txHash` must match `^0x[0-9a-fA-F]{64}$`. The claim route is rate-limited to 10 requests per minute per IP. An in-memory limiter is acceptable for v1, because a bypass only causes extra RPC reads, not wrong data.

Errors:

- RPC call fails: retry once on the fallback RPC, then return 503 "Network busy, try again". RPC failure never changes invoice state.
- Database failure during claim: return 500 with the tx hash so the page can retry. The conditional update makes retries safe.
- Wallet errors: user rejection shows "Payment cancelled". Insufficient balance and wrong network disable the Pay button with a message. A revert shows the explorer link and leaves the invoice open.

## 11. Testing

- Unit tests (vitest) for `lib/arc`:
  - `memoIdFor`, `memoDataFor`, `contentHash` (canonical JSON stability, key order independence).
  - `transferCallData` and its hash.
  - `verifyPayment` with fixture receipts: one valid, plus wrong token, wrong amount, wrong recipient, missing Memo log, failed tx.
- Unit test for amount totalling from line items.
- Development on Arc testnet with faucet USDC/EURC.
- Mainnet smoke test before submission: a 0.05 USDC invoice and a 0.05 EURC invoice, each paid from a second wallet, both showing Paid, receipts render, CSV export contains both. Transaction links go in the README.

## 12. Deliverables

- Deployed app on Vercel against Arc mainnet.
- Public GitHub repo with README: what it does, the Arc features used (Memo contract, USDC gas, EURC, deterministic finality), mainnet contract addresses and payment tx links, local setup, and a "What's next" list.
- Two-minute demo video.
- DoraHacks submission with live link, repo, description, and builder profile.

## 13. Out of scope for v1 (README "What's next")

- Partial payments.
- Card or fiat payment via App Kit Onramp.
- Paying from other chains via Unified Balance or Gateway.
- Sending invoices by email.
- Multiple users per merchant.
- An on-chain InvoiceRegistry contract.
- Nigerian NRS e-invoice reference (IRN) in `memoData`.
- Refunds.
- Smart-contract-wallet payers.
