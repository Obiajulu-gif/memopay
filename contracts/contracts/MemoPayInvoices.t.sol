// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MemoPayInvoices} from "./MemoPayInvoices.sol";
import {MockFiatToken} from "./test/MockFiatToken.sol";

contract MemoPayInvoicesTest is Test {
    MemoPayInvoices invoices;
    MockFiatToken usdc;
    MockFiatToken eurc;
    MockFiatToken other;

    uint256 merchantKey = 0xA11CE;
    uint256 payerKey = 0xB0B;
    address merchant;
    address payer;

    bytes32 constant ID = keccak256("memopay:v1:invoice-1");
    bytes32 constant CONTENT = keccak256("content");
    uint256 constant AMOUNT = 50_000; // 0.05 USDC

    event InvoicePaid(
        bytes32 indexed id, address indexed merchant, address indexed payer, address token, uint256 amount, bytes32 contentHash
    );
    event InvoiceCancelled(bytes32 indexed id, address indexed merchant);

    function setUp() public {
        usdc = new MockFiatToken("USDC");
        eurc = new MockFiatToken("EURC");
        other = new MockFiatToken("FAKE");
        invoices = new MemoPayInvoices(address(usdc), address(eurc));
        merchant = vm.addr(merchantKey);
        payer = vm.addr(payerKey);
        usdc.mint(payer, 1_000_000);
        eurc.mint(payer, 1_000_000);
        other.mint(payer, 1_000_000);
        vm.warp(1_000);
    }

    // ---- helpers ----

    function _invoice(address token) internal view returns (MemoPayInvoices.Invoice memory) {
        return MemoPayInvoices.Invoice({id: ID, merchant: merchant, token: token, amount: AMOUNT, contentHash: CONTENT});
    }

    function _merchantSig(MemoPayInvoices.Invoice memory inv, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, invoices.hashInvoice(inv));
        return abi.encodePacked(r, s, v);
    }

    function _auth(MockFiatToken token, uint256 value, bytes32 nonce)
        internal
        view
        returns (MemoPayInvoices.Authorization memory a)
    {
        a.from = payer;
        a.value = value;
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = nonce;
        bytes32 structHash = keccak256(
            abi.encode(
                token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                payer,
                address(invoices),
                value,
                a.validAfter,
                a.validBefore,
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (a.v, a.r, a.s) = vm.sign(payerKey, digest);
    }

    // ---- paying ----

    function test_PayMovesExactAmountToMerchant() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        vm.expectEmit(true, true, true, true, address(invoices));
        emit InvoicePaid(ID, merchant, payer, address(usdc), AMOUNT, CONTENT);
        invoices.pay(inv, _merchantSig(inv, merchantKey), _auth(usdc, AMOUNT, bytes32(uint256(1))));

        assertEq(usdc.balanceOf(merchant), AMOUNT);
        assertEq(usdc.balanceOf(payer), 1_000_000 - AMOUNT);
        assertEq(usdc.balanceOf(address(invoices)), 0);
        assertEq(uint8(invoices.statusOf(merchant, ID)), uint8(MemoPayInvoices.Status.Paid));
    }

    function test_PayWorksForEurc() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(eurc));
        invoices.pay(inv, _merchantSig(inv, merchantKey), _auth(eurc, AMOUNT, bytes32(uint256(1))));
        assertEq(eurc.balanceOf(merchant), AMOUNT);
    }

    function test_AnyoneCanSubmitThePayment() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        bytes memory sig = _merchantSig(inv, merchantKey);
        MemoPayInvoices.Authorization memory a = _auth(usdc, AMOUNT, bytes32(uint256(1)));
        vm.prank(address(0xCAFE));
        invoices.pay(inv, sig, a);
        assertEq(usdc.balanceOf(merchant), AMOUNT);
    }

    function test_RevertWhen_PaidTwice() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        bytes memory sig = _merchantSig(inv, merchantKey);
        invoices.pay(inv, sig, _auth(usdc, AMOUNT, bytes32(uint256(1))));
        MemoPayInvoices.Authorization memory second = _auth(usdc, AMOUNT, bytes32(uint256(2)));
        vm.expectRevert(abi.encodeWithSelector(MemoPayInvoices.InvoiceNotOpen.selector, ID));
        invoices.pay(inv, sig, second);
        assertEq(usdc.balanceOf(merchant), AMOUNT);
    }

    function test_RevertWhen_AuthorizationAmountDiffers() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        MemoPayInvoices.Authorization memory a = _auth(usdc, AMOUNT - 1, bytes32(uint256(1)));
        bytes memory sig = _merchantSig(inv, merchantKey);
        vm.expectRevert(MemoPayInvoices.AmountMismatch.selector);
        invoices.pay(inv, sig, a);
    }

    function test_RevertWhen_TermsTamperedAfterSigning() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        bytes memory sig = _merchantSig(inv, merchantKey);
        inv.amount = 1; // payer tries to pay less than the merchant signed
        MemoPayInvoices.Authorization memory a = _auth(usdc, 1, bytes32(uint256(1)));
        vm.expectRevert(MemoPayInvoices.BadMerchantSignature.selector);
        invoices.pay(inv, sig, a);
    }

    function test_RevertWhen_SignedBySomeoneElse() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        bytes memory sig = _merchantSig(inv, 0xBAD);
        MemoPayInvoices.Authorization memory a = _auth(usdc, AMOUNT, bytes32(uint256(1)));
        vm.expectRevert(MemoPayInvoices.BadMerchantSignature.selector);
        invoices.pay(inv, sig, a);
    }

    function test_RevertWhen_RecipientRedirected() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        bytes memory sig = _merchantSig(inv, merchantKey);
        inv.merchant = address(0xEE11); // attacker swaps in their own address
        MemoPayInvoices.Authorization memory a = _auth(usdc, AMOUNT, bytes32(uint256(1)));
        vm.expectRevert(MemoPayInvoices.BadMerchantSignature.selector);
        invoices.pay(inv, sig, a);
    }

    function test_RevertWhen_TokenNotSupported() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(other));
        bytes memory sig = _merchantSig(inv, merchantKey);
        MemoPayInvoices.Authorization memory a = _auth(other, AMOUNT, bytes32(uint256(1)));
        vm.expectRevert(abi.encodeWithSelector(MemoPayInvoices.UnsupportedToken.selector, address(other)));
        invoices.pay(inv, sig, a);
    }

    function test_RevertWhen_HighSSignature() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(merchantKey, invoices.hashInvoice(inv));
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory malleated = abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        MemoPayInvoices.Authorization memory a = _auth(usdc, AMOUNT, bytes32(uint256(1)));
        vm.expectRevert(MemoPayInvoices.BadMerchantSignature.selector);
        invoices.pay(inv, malleated, a);
    }

    function test_RevertWhen_SignatureFromAnotherChain() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        bytes memory sig = _merchantSig(inv, merchantKey);
        vm.chainId(5042002); // signature made for this chain must not work on another
        MemoPayInvoices.Authorization memory a = _auth(usdc, AMOUNT, bytes32(uint256(1)));
        vm.expectRevert(MemoPayInvoices.BadMerchantSignature.selector);
        invoices.pay(inv, sig, a);
    }

    function test_FailedTransferLeavesInvoiceOpen() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        bytes memory sig = _merchantSig(inv, merchantKey);
        usdc.setBlocked(merchant, true);
        MemoPayInvoices.Authorization memory a = _auth(usdc, AMOUNT, bytes32(uint256(1)));
        vm.expectRevert(bytes("blacklisted"));
        invoices.pay(inv, sig, a);
        assertEq(uint8(invoices.statusOf(merchant, ID)), uint8(MemoPayInvoices.Status.Open));
    }

    // ---- cancelling ----

    function test_MerchantCanCancelAndBlockPayment() public {
        vm.expectEmit(true, true, false, false, address(invoices));
        emit InvoiceCancelled(ID, merchant);
        vm.prank(merchant);
        invoices.cancel(ID);

        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        bytes memory sig = _merchantSig(inv, merchantKey);
        MemoPayInvoices.Authorization memory a = _auth(usdc, AMOUNT, bytes32(uint256(1)));
        vm.expectRevert(abi.encodeWithSelector(MemoPayInvoices.InvoiceNotOpen.selector, ID));
        invoices.pay(inv, sig, a);
    }

    function test_CancelOnlyAffectsCallersInvoices() public {
        vm.prank(address(0xEE11));
        invoices.cancel(ID); // someone else "cancels" the same id under their own address
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        invoices.pay(inv, _merchantSig(inv, merchantKey), _auth(usdc, AMOUNT, bytes32(uint256(1))));
        assertEq(usdc.balanceOf(merchant), AMOUNT);
    }

    function test_RevertWhen_CancellingPaidInvoice() public {
        MemoPayInvoices.Invoice memory inv = _invoice(address(usdc));
        invoices.pay(inv, _merchantSig(inv, merchantKey), _auth(usdc, AMOUNT, bytes32(uint256(1))));
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(MemoPayInvoices.InvoiceNotOpen.selector, ID));
        invoices.cancel(ID);
    }

    // ---- hashing matches the off-chain signer (viem) ----

    function test_HashMatchesViemVector() public {
        // Same inputs as lib/arc/settlement.test.ts: chainId 5042, contract 0x1111…1111.
        vm.chainId(5042);
        MemoPayInvoices deployed = MemoPayInvoices(address(0x1111111111111111111111111111111111111111));
        deployCodeTo("MemoPayInvoices.sol:MemoPayInvoices", abi.encode(address(usdc), address(eurc)), address(deployed));
        MemoPayInvoices.Invoice memory inv = MemoPayInvoices.Invoice({
            id: keccak256("memopay:v1:vector"),
            merchant: 0x2222222222222222222222222222222222222222,
            token: 0x3600000000000000000000000000000000000000,
            amount: 3_250_000,
            contentHash: keccak256("vector-content")
        });
        assertEq(deployed.hashInvoice(inv), VIEM_VECTOR_DIGEST);
    }

    bytes32 constant VIEM_VECTOR_DIGEST = 0x749da5d5658292459a76186ac1fe86ac6c07fb6132724177491ebad47536c1ee;
}
