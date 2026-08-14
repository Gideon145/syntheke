// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SynthekeContract} from "../src/SynthekeContract.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

/**
 * Lifecycle correctness fixes (Batch 5):
 *  1. First escrow deposit now enters COMMITTED (was skipping it)
 *  2. Persistent breaches no longer reset the cure deadline
 *  3. CURING pacts no longer silently self-heal after the deadline
 */
contract LifecycleFixesTest is Test {
    SynthekeContract public syntheke;
    AgentRegistry public registry;
    EscrowVault public escrow;
    ReputationRegistry public reputation;

    address public monitor = makeAddr("monitor");
    address public partyA = makeAddr("partyA");
    address public partyB = makeAddr("partyB");

    SynthekeContract.PactTerms public defaultTerms;

    function setUp() public {
        registry = new AgentRegistry(address(0));
        escrow = new EscrowVault();
        reputation = new ReputationRegistry();
        syntheke = new SynthekeContract(monitor, address(registry), address(escrow), address(reputation));
        escrow.setSynthekeContract(address(syntheke));
        reputation.setSynthekeContract(address(syntheke));

        defaultTerms = SynthekeContract.PactTerms({
            amount: 1000 ether,
            settlementAsset: address(0),
            duration: 10000,
            collateralRatio: 15000,
            liquidationThreshold: 12000,
            interestRate: 800,
            penaltyBps: 500,
            breachGraceBlocks: 100,
            renegotiationWindow: 720,
            maxRenegotiationRounds: 3,
            monitoredConditions: 0x3FF
        });
    }

    function _proposedPact() internal returns (bytes32 pactId) {
        vm.prank(partyA);
        pactId = syntheke.createDraft();
        vm.prank(partyB);
        syntheke.joinDraft(pactId);
        vm.prank(partyA);
        syntheke.proposeTerms(pactId, defaultTerms);
        vm.prank(partyB);
        syntheke.finalizeNegotiation(pactId);
    }

    function _activePact() internal returns (bytes32 pactId) {
        pactId = _proposedPact();
        vm.prank(partyA);
        syntheke.depositEscrow(pactId);
        vm.prank(partyB);
        syntheke.depositEscrow(pactId);
    }

    // ──── COMMITTED state ─────────────────────────────────

    function test_FirstDepositEntersCommitted() public {
        bytes32 pactId = _proposedPact();

        vm.prank(partyA);
        syntheke.depositEscrow(pactId);

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.COMMITTED));
        assertTrue(p.partyADeposited);
        assertFalse(p.partyBDeposited);
    }

    function test_SecondDepositActivatesFromCommitted() public {
        bytes32 pactId = _proposedPact();

        vm.prank(partyA);
        syntheke.depositEscrow(pactId);
        vm.prank(partyB);
        syntheke.depositEscrow(pactId);

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.ACTIVE));
        assertTrue(syntheke.isActive(pactId));
    }

    // ──── Cure deadline not reset ─────────────────────────

    function test_PersistentBreachDoesNotResetCureDeadline() public {
        bytes32 pactId = _activePact();

        // First breach → CURING with deadline D1 (bitmap 0 → MINOR tier)
        vm.prank(monitor);
        syntheke.recordAttestation(pactId, 0, SynthekeContract.SynthekeState.BREACHED, bytes32(0), "breach");

        SynthekeContract.PactData memory p1 = syntheke.getPactState(pactId);
        assertEq(uint256(p1.state), uint256(SynthekeContract.SynthekeState.CURING));
        uint256 deadline1 = p1.cureDeadline;
        assertTrue(deadline1 > 0);

        // Persistent breach — a second BREACHED attestation must NOT reset it
        vm.roll(block.number + 10);
        vm.prank(monitor);
        syntheke.recordAttestation(pactId, 0, SynthekeContract.SynthekeState.BREACHED, bytes32(0), "still breaching");

        SynthekeContract.PactData memory p2 = syntheke.getPactState(pactId);
        assertEq(uint256(p2.state), uint256(SynthekeContract.SynthekeState.CURING));
        assertEq(p2.cureDeadline, deadline1, "cure deadline must not reset on persistent breach");
    }

    function test_HealAfterDeadlineDoesNotAutoRecover() public {
        bytes32 pactId = _activePact();

        vm.prank(monitor);
        syntheke.recordAttestation(pactId, 0, SynthekeContract.SynthekeState.BREACHED, bytes32(0), "breach");

        SynthekeContract.PactData memory p1 = syntheke.getPactState(pactId);
        uint256 deadline = p1.cureDeadline;

        // Warp past the deadline, then a healthy attestation arrives
        vm.roll(deadline + 1);
        vm.prank(monitor);
        syntheke.recordAttestation(pactId, 0x3FF, SynthekeContract.SynthekeState.ACTIVE, bytes32(0), "healthy now");

        SynthekeContract.PactData memory p2 = syntheke.getPactState(pactId);
        assertEq(uint256(p2.state), uint256(SynthekeContract.SynthekeState.CURING),
            "post-deadline heal must not auto-recover");

        // The monitor can now escalate to arbitration
        vm.prank(monitor);
        syntheke.escalateUncuredBreach(pactId);
        SynthekeContract.PactData memory p3 = syntheke.getPactState(pactId);
        assertEq(uint256(p3.state), uint256(SynthekeContract.SynthekeState.ARBITRATING));
    }

    function test_HealWithinDeadlineRecovers() public {
        bytes32 pactId = _activePact();

        vm.prank(monitor);
        syntheke.recordAttestation(pactId, 0, SynthekeContract.SynthekeState.BREACHED, bytes32(0), "breach");

        // Within the window, healthy attestation heals the pact
        vm.prank(monitor);
        syntheke.recordAttestation(pactId, 0x3FF, SynthekeContract.SynthekeState.ACTIVE, bytes32(0), "cured");

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.ACTIVE));
        assertEq(p.consecutiveDegradation, 0);
    }
}
