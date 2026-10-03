# Token integration review — MemoPayInvoices

Date: 3 October 2026. Method: Trail of Bits token integration checklist, Slither 0.11.6, live reads from Arc mainnet and testnet.
Scope: `contracts/contracts/MemoPayInvoices.sol` and the app code that signs for and calls it.

## Summary

MemoPayInvoices does not implement a token. It integrates exactly two: Circle's USDC and EURC on Arc. Both are fixed in the constructor and can't be changed. Each payment pulls exactly the signed amount with EIP-3009 `receiveWithAuthorization` and forwards it to the merchant in the same transaction.

**Overall risk: low.**

- No critical or high issues remain.
- One low issue was found and fixed: the constructor accepted zero or duplicate token addresses.
- One informational Slither finding remains, and it is benign.

The main residual risk sits outside this contract: Circle can upgrade, pause or blocklist USDC and EURC. Every one of those makes `pay` revert atomically. None of them can leave funds stuck in the contract or produce a false "paid".

## On-chain facts about the integrated tokens

Read from Arc on 3 October 2026.

| Check | USDC (mainnet `0x3600…0000`) | EURC (mainnet `0xbEf5…21c1`) |
|---|---|---|
| Implementation | Circle FiatTokenProxy (ZeppelinOS slots) → FiatTokenV2 | same |
| Upgradeable | Yes. Implementation `0xc6ad…3ca6`, admin `0x9005…16e0` | Yes. Implementation `0xc606…cf3c`, admin `0xb683…be97` |
| `name()` / `version()` | "USDC" / "2" | "EURC" / "2" |
| EIP-712 domain = keccak(name, "2", chainId, token) | **Matches** on mainnet and testnet | **Matches** on mainnet and testnet |
| `decimals()` | 6 | 6 |
| `transfer` return value | Returns `true` (32-byte bool) | Returns `true` |
| Transfer to `address(0)` | Reverts | Reverts |
| `receiveWithAuthorization` | Present. Enforces "caller must be the payee" | Present, same rule |
| Pausable / blocklist | Yes: pauser and blacklister roles set. Not paused. | Yes. Not paused. |

The domain match matters most. The app builds the payer's EIP-3009 typed data as `{name: name(), version: "2", chainId, verifyingContract: token}`. That this equals the token's own `DOMAIN_SEPARATOR` on both networks means payer signatures will validate.

## Slither

```
slither contracts/MemoPayInvoices.sol   (solc 0.8.28, 102 detectors)
```

- **`missing-zero-check`** on the constructor's token addresses. **Fixed:** the constructor now reverts `BadTokenConfig()` on a zero or duplicate address. Test: `test_RevertWhen_DeployedWithZeroOrDuplicateTokens`.
- **`reentrancy-events`** in `pay`: `InvoicePaid` is emitted after the two token calls. **Benign.**
  - The invoice status is written before any external call (checks-effects-interactions).
  - The only call targets are the two immutable FiatToken addresses, which have no transfer hooks.
  - Re-entering `pay` for the same invoice reverts `InvoiceNotOpen`.

Human summary: 100 source lines, no assembly, 0 high, 0 medium, 1 low (now fixed). Features flagged: `Ecrecover`, `Tokens interaction`.

`slither-check-erc` doesn't apply, because the contract is not a token.

## Weird-ERC20 patterns against this integration

| Pattern | Applies to USDC/EURC on Arc? | How MemoPayInvoices handles it |
|---|---|---|
| Reentrant transfer hooks (ERC-777) | No hooks in FiatToken | Status is set before external calls anyway |
| Missing return value | No, returns `true` | `if (!transfer(...)) revert TransferFailed()` |
| Fee on transfer | No | Pulls `amount`, sends `amount`. A fee would make the forward revert, so it fails safe |
| Balance changes outside transfers (rebasing) | No | The contract keeps no balance accounting |
| **Upgradeable token** | **Yes** (Circle admin) | Accepted dependency. The contract is immutable, so if Circle changes the token's interface, deploy a new MemoPayInvoices |
| Flash mint | No | Not relevant |
| **Blocklist** | **Yes** | A blocklisted payer, merchant or contract makes `pay` revert, and the status rolls back (`test_FailedTransferLeavesInvoiceOpen`). Arc can drop blocklist reverts without a receipt, so the app simulates first and times out after 60 s, then asks the server |
| **Pausable** | **Yes** | `pay` reverts while paused. Nothing moves and the invoice stays open |
| Approval race | Not used | No `approve` anywhere. EIP-3009 authorizes an exact amount, once |
| Revert on transfer to zero address | Yes | `inv.merchant == address(0)` is rejected first (`BadMerchantSignature`) |
| Revert on zero-value transfer | No | Zero amounts are blocked by the app (amount > 0). See L1 |
| Multiple token addresses | Not for EURC | See the next row |
| **ERC-20 representation of native currency** | **Yes (USDC)**: native gas balance (18 decimals) and ERC-20 (6 decimals) are one balance | The contract has no `receive` or `fallback`, so native value sent to it reverts. It only uses the ERC-20 interface. The app reads amounts through ERC-20 `balanceOf`, and converts ×10¹² only to compare against the native gas balance |
| Low decimals (6) | Yes | All amounts are 6-decimal integers end to end. Money is never handled as a JavaScript float |
| Code injection via token name | No | `name()` only goes into EIP-712 typed data and is never rendered as HTML |
| Unusual `permit` | Not used | Uses EIP-3009 only |
| Transfer less than the amount requested | No | Same as fee on transfer |

## Integration safety

- **Token allowlist:** two immutable addresses, checked at the top of `pay`.
- **Exact amounts:** `auth.value == inv.amount`, where `inv.amount` is merchant-signed. The authorization nonce must equal the invoice's EIP-712 digest, and only `auth.from` may call `pay`.
- **No custody:** funds are pulled and forwarded in one transaction. Tokens sent directly to the contract, outside `pay`, can't be recovered. This is documented and accepted, since the contract has no owner.
- **Privileges:** none. No owner, admin, upgrade, pause, fee or sweep.
- **Tests:** 19 Solidity tests, plus a viem↔Solidity digest vector and a local end-to-end run of the app's signing and verification code against the compiled contract.

## Recommendations

| ID | Severity | Item | Status |
|---|---|---|---|
| L0 | Low | Constructor zero or duplicate token check | **Fixed** |
| L1 | Low | `pay` accepts a merchant-signed zero-amount invoice and emits `InvoicePaid` for 0. Only the merchant can create such terms, and the app refuses amount 0. Add `if (inv.amount == 0) revert` in a future version if invoices are ever created outside the app | Open (no impact today) |
| I1 | Info | `reentrancy-events` (event after calls) | Benign. Kept for checks-effects-interactions clarity |
| I2 | Info | Circle can upgrade, pause or blocklist USDC and EURC | Accepted dependency. Payments revert atomically, and no funds can get stuck |
| I3 | Info | After deploying, verify the contract source on explorer.arc.io so payers can read what they're calling | Do after deployment |
