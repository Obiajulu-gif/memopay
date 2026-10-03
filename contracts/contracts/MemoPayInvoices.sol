// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Circle FiatToken v2 surface used here (USDC and EURC on Arc).
interface IFiatToken {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function transfer(address to, uint256 value) external returns (bool);
}

/// @title MemoPayInvoices
/// @notice Settles MemoPay invoices on Arc with the terms enforced on-chain.
/// The merchant signs the invoice terms off-chain (EIP-712, no gas). The payer signs an EIP-3009
/// ReceiveWithAuthorization for exactly the invoice amount whose nonce is the invoice digest, then submits
/// `pay` themselves — normally wrapped in Arc's Memo contract, which keeps the payer as msg.sender and
/// attaches the invoice ID as a memo. This contract checks both
/// signatures, refuses paid or cancelled invoices, pulls the funds and forwards them to the merchant
/// in the same transaction. It never holds funds between transactions.
contract MemoPayInvoices {
    struct Invoice {
        bytes32 id; // MemoPay memo ID: keccak256("memopay:v1:" + invoice UUID)
        address merchant; // receives the funds and signed these terms
        address token; // USDC or EURC
        uint256 amount; // token units (6 decimals)
        bytes32 contentHash; // keccak256 of the canonical invoice JSON
    }

    struct Authorization {
        address from; // payer
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    enum Status {
        Open,
        Paid,
        Cancelled
    }

    bytes32 public constant INVOICE_TYPEHASH =
        keccak256("Invoice(bytes32 id,address merchant,address token,uint256 amount,bytes32 contentHash)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 private constant HALF_ORDER = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    address public immutable usdc;
    address public immutable eurc;

    /// Status per merchant and invoice id, so one merchant can never affect another's invoices.
    mapping(address merchant => mapping(bytes32 id => Status)) public statusOf;

    event InvoicePaid(
        bytes32 indexed id, address indexed merchant, address indexed payer, address token, uint256 amount, bytes32 contentHash
    );
    event InvoiceCancelled(bytes32 indexed id, address indexed merchant);

    error UnsupportedToken(address token);
    error InvoiceNotOpen(bytes32 id);
    error BadMerchantSignature();
    error AmountMismatch();
    error TransferFailed();
    error NotPayer();
    error AuthorizationNotForInvoice();
    error BadTokenConfig();

    constructor(address usdc_, address eurc_) {
        if (usdc_ == address(0) || eurc_ == address(0) || usdc_ == eurc_) revert BadTokenConfig();
        usdc = usdc_;
        eurc = eurc_;
    }

    /// EIP-712 domain separator, computed per call so it always reflects the current chain.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("MemoPay"), keccak256("1"), block.chainid, address(this)));
    }

    /// Digest the merchant signs for `inv`.
    function hashInvoice(Invoice calldata inv) public view returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(INVOICE_TYPEHASH, inv.id, inv.merchant, inv.token, inv.amount, inv.contentHash));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// Pays `inv` with the payer's EIP-3009 authorization. Only the payer may submit it, and the
    /// authorization's nonce must be this invoice's digest, so a copied authorization can't be spent
    /// on any other invoice and a copied call can't be front-run by someone else.
    function pay(Invoice calldata inv, bytes calldata merchantSig, Authorization calldata auth) external {
        if (inv.token != usdc && inv.token != eurc) revert UnsupportedToken(inv.token);
        if (statusOf[inv.merchant][inv.id] != Status.Open) revert InvoiceNotOpen(inv.id);
        if (msg.sender != auth.from) revert NotPayer();
        bytes32 digest = hashInvoice(inv);
        if (inv.merchant == address(0) || _recover(digest, merchantSig) != inv.merchant) revert BadMerchantSignature();
        if (auth.nonce != digest) revert AuthorizationNotForInvoice();
        if (auth.value != inv.amount) revert AmountMismatch();

        statusOf[inv.merchant][inv.id] = Status.Paid; // effects before interactions

        IFiatToken(inv.token).receiveWithAuthorization(
            auth.from, address(this), inv.amount, auth.validAfter, auth.validBefore, auth.nonce, auth.v, auth.r, auth.s
        );
        if (!IFiatToken(inv.token).transfer(inv.merchant, inv.amount)) revert TransferFailed();

        emit InvoicePaid(inv.id, inv.merchant, auth.from, inv.token, inv.amount, inv.contentHash);
    }

    /// Cancels one of the caller's own open invoices so it can no longer be paid.
    function cancel(bytes32 id) external {
        if (statusOf[msg.sender][id] != Status.Open) revert InvoiceNotOpen(id);
        statusOf[msg.sender][id] = Status.Cancelled;
        emit InvoiceCancelled(id, msg.sender);
    }

    /// ecrecover over a 65-byte r‖s‖v signature, rejecting malleable (high-s) and malformed ones.
    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address signer) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > HALF_ORDER || (v != 27 && v != 28)) return address(0);
        signer = ecrecover(digest, v, r, s);
    }
}
