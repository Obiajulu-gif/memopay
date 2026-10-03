# Running MemoPay on Arc mainnet

The production site, https://memopay.vercel.app, already runs on Arc mainnet (chain 5042). Vercel's Production environment sets `ARC_NETWORK=mainnet` and `NEXT_PUBLIC_ARC_NETWORK=mainnet`, and the header pill reads "Arc mainnet". Preview deployments run on Arc testnet.

This guide covers what's left: funding wallets, a real payment, and recording the proof for the Arc Microgrants submission.

## 1. Add Arc mainnet to MetaMask

MemoPay asks your wallet to add Arc automatically the first time you connect. To add it by hand:

| Field | Value |
|---|---|
| Network name | Arc |
| RPC URL | `https://rpc.mainnet.arc.io` |
| Chain ID | `5042` |
| Currency symbol | `USDC` |
| Block explorer | `https://explorer.arc.io` |

## 2. Fund two wallets with USDC on Arc

You need two regular wallets (EOAs), for example two MetaMask accounts:

- **Merchant wallet**: signs in to MemoPay and receives payments. It needs no funds.
- **Payer wallet**: pays the invoices. Give it about 2 USDC for the test payments and network fees, plus about 0.10 EURC if you want to test a EURC invoice.

USDC is Arc's gas token, so the payer needs nothing else.

Ways to get USDC onto Arc:

- **Bridge from another chain** with Circle's CCTP. Use a bridge app that lists Arc as a destination, or Arc App Kit's Bridge. Arc's CCTP domain is 26.
- **Withdraw from an exchange** that supports the Arc network. Check the withdrawal network says Arc before you confirm.

Arc mainnet contracts:

- USDC: `0x3600000000000000000000000000000000000000`
- EURC: `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1`
- Memo: `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`

## 3. Run the mainnet smoke test

1. Open https://memopay.vercel.app with the merchant wallet and select **Connect wallet**. Approve the sign-in message.
2. Create an invoice for **0.05 USDC**. Copy the pay link.
3. Open the pay link with the payer wallet. Prefer a separate browser profile or a private window, so the merchant session doesn't get in the way.
4. Select **Connect wallet to pay**, then **Pay 0.05 USDC**, and confirm in MetaMask. The page should show **Paid** within a few seconds.
5. Repeat with a **0.05 EURC** invoice.
6. Back in the merchant session, check each invoice:
   - it shows **paid**;
   - "On-chain activity" lists the payment as **Matched**;
   - the receipt page opens;
   - **Export CSV** contains both invoices.
7. Open each transaction on https://explorer.arc.io and confirm its logs show a `Memo` event whose `memoId` matches the one on the invoice page.

## 4. Record the proof

Paste the two explorer links into the "Mainnet proof" section of `README.md`, replacing `_pending_`. Then commit and push:

```bash
git add README.md
git commit -m "docs: add mainnet payment proof"
git push origin main
```

## 5. Submit to Arc Microgrants

On https://dorahacks.io/hackathon/arc-microgrants select **Submit Build**:

- **Live deployment:** https://memopay.vercel.app
- **Public repo:** https://github.com/Obiajulu-gif/memopay
- **Description:** "Invoice links paid in USDC or EURC on Arc. Each payment carries the invoice ID on-chain through Arc's Memo contract, so MemoPay verifies it and marks the invoice paid automatically."
- **What it uses Arc for:**
  - the Memo contract, for the on-chain invoice reference;
  - USDC as gas;
  - EURC;
  - sub-second deterministic finality.
- **Builder profile:** your GitHub, X, or Farcaster.
- **Demo video (optional):** 2 minutes. Create an invoice, pay it, show "Paid", open the explorer Memo event, then show the receipt and the CSV.

The deadline is 14 October 2026, 23:59 ET. Submissions are reviewed on a rolling basis, so submit early.

## Troubleshooting

- **MetaMask shows a red "Request from" alert when you sign in.** MetaMask's security checks flag new, unknown sites, and `*.vercel.app` addresses are often flagged. The message only proves you own the address: "Estimated changes: No changes", and no funds can move. To stop the warning for your users, connect a custom domain in Vercel and report the false positive to MetaMask's security provider.
- **Payment stays pending.** Arc requires a `maxFeePerGas` of at least 20 gwei, and MemoPay sets this. If your wallet overrides the fee, reset it to the suggested value.
- **The payment went through but the invoice didn't change to paid.** Open the invoice as the merchant and select **Recheck payment**. MemoPay searches Arc for the invoice's memo and verifies it.
- **"Smart-contract wallets can't pay".** Arc's Memo contract only accepts direct calls from regular wallets. Use a MetaMask, Rabby, or hardware wallet account.
