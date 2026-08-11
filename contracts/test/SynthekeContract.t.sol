// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {SynthekeContract} from "../src/SynthekeContract.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract SynthekeContractTest is Test {
    SynthekeContract public syntheke;
    AgentRegistry public registry;
    EscrowVault public escrow;
    ReputationRegistry public reputation;

    address public monitor = makeAddr("monitor");
    address public partyA = makeAddr("partyA");
    address public partyB = makeAddr("partyB");
    address public stranger = makeAddr("stranger");

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
            breachGraceBlocks: 1440,
            renegotiationWindow: 720,
            maxRenegotiationRounds: 3,
            monitoredConditions: 0x3FF
        });
    }

    // ──── CREATION ────────────────────────────────────────

    function test_CreateDraft() public {
        vm.prank(partyA);
        bytes32 pactId = syntheke.createDraft();

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.DRAFT));
        assertEq(p.partyA, partyA);
        assertEq(syntheke.getPactCount(), 1);
    }

    function test_JoinDraft() public {
        vm.prank(partyA);
        bytes32 pactId = syntheke.createDraft();

        vm.prank(partyB);
        syntheke.joinDraft(pactId);

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.NEGOTIATING));
        assertEq(p.partyB, partyB);
    }

    function test_RevertJoin_OwnDraft() public {
        vm.prank(partyA);
        bytes32 pactId = syntheke.createDraft();

        vm.prank(partyA);
        vm.expectRevert(SynthekeContract.NotParty.selector);
        syntheke.joinDraft(pactId);
    }

    // ──── NEGOTIATION ─────────────────────────────────────

    function test_ProposeAndFinalizeTerms() public {
        vm.startPrank(partyA);
        bytes32 pactId = syntheke.createDraft();
        vm.stopPrank();

        vm.prank(partyB);
        syntheke.joinDraft(pactId);

        vm.prank(partyA);
        syntheke.proposeTerms(pactId, defaultTerms);

        vm.prank(partyB);
        syntheke.finalizeNegotiation(pactId);

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.PROPOSED));
    }

    // ──── ACTIVATION ──────────────────────────────────────

    function test_FullActivation() public {
        bytes32 pactId = _createAndNegotiate();

        vm.prank(partyA);
        syntheke.depositEscrow(pactId);

        vm.prank(partyB);
        syntheke.depositEscrow(pactId);

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.ACTIVE));
        assertTrue(syntheke.isActive(pactId));
    }

    // ──── MONITORING ──────────────────────────────────────

    function test_RecordAttestation_Active() public {
        bytes32 pactId = _activatePact();

        vm.prank(monitor);
        syntheke.recordAttestation(
            pactId, 0x3FF, SynthekeContract.SynthekeState.ACTIVE, bytes32(uint256(1)), "All conditions healthy"
        );

        assertEq(syntheke.getAttestations(pactId).length, 1);
    }

    function test_RecordAttestation_Degrading() public {
        bytes32 pactId = _activatePact();

        vm.startPrank(monitor);
        syntheke.recordAttestation(
            pactId, 0x3F0, SynthekeContract.SynthekeState.DEGRADING, bytes32(uint256(2)), "Soft threshold approaching"
        );

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.DEGRADING));
    }

    function test_RecordAttestation_BreachCatastrophic() public {
        bytes32 pactId = _activatePact();

        // Identity revoked = bit 0 set = CATASTROPHIC
        vm.prank(monitor);
        syntheke.recordAttestation(
            pactId,
            0x001, // bit 0 = identity revoked
            SynthekeContract.SynthekeState.BREACHED,
            bytes32(uint256(3)),
            "Agent identity revoked"
        );

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.ARBITRATING));
    }

    function test_RecordAttestation_BreachMinor() public {
        bytes32 pactId = _activatePact();

        // Soft condition only = MINOR, goes to CURING
        vm.prank(monitor);
        syntheke.recordAttestation(
            pactId,
            0x008, // bit 3 = soft condition
            SynthekeContract.SynthekeState.BREACHED,
            bytes32(uint256(4)),
            "Minor deviation"
        );

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint256(p.state), uint256(SynthekeContract.SynthekeState.CURING));
    }

    function test_RevertAttestation_NotMonitor() public {
        bytes32 pactId = _activatePact();

        vm.prank(stranger);
        vm.expectRevert(SynthekeContract.NotMonitor.selector);
        syntheke.recordAttestation(pactId, 0x3FF, SynthekeContract.SynthekeState.ACTIVE, bytes32(0), "");
    }

    // ──── RENEGOTIATION ───────────────────────────────────

    function test_RenegotiationCycle() public {
        bytes32 pactId = _activatePact();

        // Degrade
        vm.prank(monitor);
        syntheke.recordAttestation(
            pactId,
            0x3F0,
            SynthekeContract.SynthekeState.DEGRADING,
            bytes32(uint256(5)),
            "Collateral approaching threshold"
        );

        // Initiate renegotiation
        vm.prank(partyA);
        syntheke.initiateRenegotiation(pactId);

        assertEq(uint256(syntheke.getPactState(pactId).state), uint256(SynthekeContract.SynthekeState.RENEGOTIATING));

        // Accept renegotiated terms
        vm.prank(partyB);
        syntheke.acceptRenegotiation(pactId, defaultTerms);

        assertEq(uint256(syntheke.getPactState(pactId).state), uint256(SynthekeContract.SynthekeState.ACTIVE));
    }

    // ──── RESOLUTION ──────────────────────────────────────

    function test_ResolveAndSettle() public {
        bytes32 pactId = _activatePact();

        // Force arbitration
        vm.prank(monitor);
        syntheke.recordAttestation(
            pactId, 0x001, SynthekeContract.SynthekeState.BREACHED, bytes32(uint256(6)), "Identity revoked"
        );

        // Resolve (monitor calls after off-chain mediation)
        vm.prank(monitor);
        syntheke.resolvePact(pactId, 500 ether, 300 ether, 700 ether, bytes32(uint256(7)));

        assertEq(uint256(syntheke.getPactState(pactId).state), uint256(SynthekeContract.SynthekeState.SETTLING));

        // Finalize
        vm.prank(monitor);
        syntheke.finalizeSettlement(pactId);

        assertEq(uint256(syntheke.getPactState(pactId).state), uint256(SynthekeContract.SynthekeState.CLOSED));
    }

    // ──── TERMINATION ─────────────────────────────────────

    function test_TerminateDraft() public {
        vm.prank(partyA);
        bytes32 pactId = syntheke.createDraft();

        vm.prank(partyA);
        syntheke.terminatePact(pactId);

        assertEq(uint256(syntheke.getPactState(pactId).state), uint256(SynthekeContract.SynthekeState.TERMINATED));
    }

    // ──── EXPIRY ──────────────────────────────────────────

    function test_ExpireDraft() public {
        vm.prank(partyA);
        bytes32 pactId = syntheke.createDraft();

        vm.prank(monitor);
        syntheke.expirePact(pactId);

        assertEq(uint256(syntheke.getPactState(pactId).state), uint256(SynthekeContract.SynthekeState.EXPIRED));
    }

    // ──── VIEWS ───────────────────────────────────────────

    function test_GetPactIds() public {
        vm.prank(partyA);
        syntheke.createDraft();

        vm.prank(partyA);
        syntheke.createDraft();

        assertEq(syntheke.getPactIds().length, 2);
        assertEq(syntheke.getPactCount(), 2);
    }

    // ──── HELPERS ─────────────────────────────────────────

    function _createAndNegotiate() internal returns (bytes32 pactId) {
        vm.prank(partyA);
        pactId = syntheke.createDraft();

        vm.prank(partyB);
        syntheke.joinDraft(pactId);

        vm.prank(partyA);
        syntheke.proposeTerms(pactId, defaultTerms);

        vm.prank(partyB);
        syntheke.finalizeNegotiation(pactId);
    }

    function _activatePact() internal returns (bytes32 pactId) {
        pactId = _createAndNegotiate();

        vm.prank(partyA);
        syntheke.depositEscrow(pactId);

        vm.prank(partyB);
        syntheke.depositEscrow(pactId);
    }
}
