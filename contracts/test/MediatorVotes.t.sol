// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MediatorVotes} from "../src/MediatorVotes.sol";
import {TestUSDC3009} from "../src/TestUSDC3009.sol";

contract MediatorVotesTest is Test {
    MediatorVotes public votes;
    TestUSDC3009 public token;

    address owner = address(0xA11CE);
    address themis = address(0x1111);
    address athena = address(0x2222);
    address solon = address(0x3333);

    uint256 keyThemis = 0x11;
    uint256 keyAthena = 0x22;
    uint256 keySolon = 0x33;

    bytes32 pactId = bytes32(uint256(7));

    function setUp() public {
        address[] memory mediators = new address[](3);
        mediators[0] = themis;
        mediators[1] = athena;
        mediators[2] = solon;
        vm.prank(owner);
        votes = new MediatorVotes(mediators);
        token = new TestUSDC3009();
    }

    function commitment(uint256 k, string memory verdict, uint256 score, bytes32 reasonHash, bytes32 nonce)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(verdict, score, reasonHash, nonce));
    }

    function test_RevealBeforeAllCommittedReverts() public {
        bytes32 reason = keccak256("r1");
        bytes32 nonce = keccak256("n1");
        bytes32 c = commitment(keyThemis, "approve", 70, reason, nonce);
        vm.prank(themis);
        votes.commitVote(pactId, c);

        vm.expectRevert("not all committed");
        vm.prank(themis);
        votes.revealVote(pactId, "approve", 70, reason, nonce);
    }

    function test_CommitRevealRoundCompletes() public {
        bytes32 r1 = keccak256("r1");
        bytes32 r2 = keccak256("r2");
        bytes32 r3 = keccak256("r3");
        bytes32 n1 = keccak256("n1");
        bytes32 n2 = keccak256("n2");
        bytes32 n3 = keccak256("n3");

        vm.prank(themis);
        votes.commitVote(pactId, commitment(keyThemis, "approve", 70, r1, n1));
        vm.prank(athena);
        votes.commitVote(pactId, commitment(keyAthena, "approve", 60, r2, n2));
        vm.prank(solon);
        votes.commitVote(pactId, commitment(keySolon, "reject", 40, r3, n3));

        vm.prank(themis);
        votes.revealVote(pactId, "approve", 70, r1, n1);
        vm.prank(athena);
        votes.revealVote(pactId, "approve", 60, r2, n2);
        vm.prank(solon);
        votes.revealVote(pactId, "reject", 40, r3, n3);

        (uint256 a, uint256 rej, uint256 abs) = votes.tally(pactId);
        assertEq(a, 2);
        assertEq(rej, 1);
        assertEq(abs, 0);
        assertEq(votes.getVotes(pactId).length, 3);
        assertEq(votes.verdictCount(pactId), 1);
    }

    function test_WrongRevealFailsCommitment() public {
        bytes32 reason = keccak256("r1");
        bytes32 nonce = keccak256("n1");
        vm.prank(themis);
        votes.commitVote(pactId, commitment(keyThemis, "approve", 70, reason, nonce));
        vm.prank(athena);
        votes.commitVote(pactId, commitment(keyAthena, "approve", 60, reason, nonce));
        vm.prank(solon);
        votes.commitVote(pactId, commitment(keySolon, "approve", 50, reason, nonce));

        // Trying to reveal a DIFFERENT verdict than committed → revert
        vm.expectRevert("commitment mismatch");
        vm.prank(themis);
        votes.revealVote(pactId, "reject", 30, reason, nonce);
    }

    function test_DoubleCommitReverts() public {
        bytes32 c = commitment(keyThemis, "approve", 70, keccak256("r"), keccak256("n"));
        vm.prank(themis);
        votes.commitVote(pactId, c);
        vm.expectRevert("already committed");
        vm.prank(themis);
        votes.commitVote(pactId, c);
    }

    function test_NonMediatorCannotCommit() public {
        vm.expectRevert("not mediator");
        vm.prank(address(0xdead));
        votes.commitVote(pactId, bytes32(uint256(1)));
    }

    function test_EIP3009_TransferWithAuthorization() public {
        address payer = vm.addr(0xABC);
        address payee = address(0xDEF);
        uint256 amount = 1_000_000;
        token.mint(payer, amount);

        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 3600;
        bytes32 nonce = keccak256("auth1");

        bytes32 structHash = keccak256(
            abi.encode(
                token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                payer,
                payee,
                amount,
                validAfter,
                validBefore,
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xABC, digest);

        token.transferWithAuthorization(payer, payee, amount, validAfter, validBefore, nonce, v, r, s);

        assertEq(token.balanceOf(payer), 0);
        assertEq(token.balanceOf(payee), amount);
        assertTrue(token.authorizationState(payer, nonce));
    }

    function test_EIP3009_ReplayReverts() public {
        address payer = vm.addr(0xABC);
        address payee = address(0xDEF);
        uint256 amount = 1_000_000;
        token.mint(payer, amount);

        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 3600;
        bytes32 nonce = keccak256("auth1");

        bytes32 structHash = keccak256(
            abi.encode(
                token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                payer,
                payee,
                amount,
                validAfter,
                validBefore,
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xABC, digest);

        token.transferWithAuthorization(payer, payee, amount, validAfter, validBefore, nonce, v, r, s);
        vm.expectRevert("already used");
        token.transferWithAuthorization(payer, payee, amount, validAfter, validBefore, nonce, v, r, s);
    }
}
