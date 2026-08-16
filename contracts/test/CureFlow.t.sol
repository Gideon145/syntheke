// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SynthekeContract} from "../src/SynthekeContract.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

/**
 * Cure attribution (Batch 6):
 *  1. recordBreach attributes the breaching party on-chain
 *  2. Only the breaching party can confirmCure
 *  3. confirmCure restores ACTIVE and clears breach state
 *  4. The non-breaching party cannot confirmCure
 */
contract CureFlowTest is Test {
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

    function _activePact() internal returns (bytes32 pactId) {
        vm.startPrank(partyA);
        pactId = syntheke.createDraft();
        vm.stopPrank();
        vm.prank(partyB);
        syntheke.joinDraft(pactId);
        vm.prank(partyA);
        syntheke.proposeTerms(pactId, defaultTerms);
        vm.prank(partyB);
        syntheke.finalizeNegotiation(pactId);
        vm.prank(partyA);
        syntheke.depositEscrow(pactId);
        vm.prank(partyB);
        syntheke.depositEscrow(pactId);
        assertEq(uint(syntheke.getPactState(pactId).state), uint(SynthekeContract.SynthekeState.ACTIVE));
    }

    function test_recordBreach_attributesBreachingParty() public {
        bytes32 pactId = _activePact();

        vm.prank(monitor);
        syntheke.recordBreach(pactId, uint256(0x7), "payment failed", partyB);

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(p.breachingParty, partyB);
        assertEq(uint(p.state), uint(SynthekeContract.SynthekeState.CURING));
    }

    function test_recordBreach_rejectsNonPartyAttribution() public {
        bytes32 pactId = _activePact();
        vm.prank(monitor);
        vm.expectRevert(bytes("Invalid breaching party"));
        syntheke.recordBreach(pactId, uint256(0x7), "payment failed", makeAddr("outsider"));
    }

    function test_confirmCure_byBreachingParty_restoresActive() public {
        bytes32 pactId = _activePact();
        vm.prank(monitor);
        syntheke.recordBreach(pactId, uint256(0x7), "payment failed", partyB);

        vm.prank(partyB);
        syntheke.confirmCure(pactId);

        SynthekeContract.PactData memory p = syntheke.getPactState(pactId);
        assertEq(uint(p.state), uint(SynthekeContract.SynthekeState.ACTIVE));
        assertEq(uint(p.breachTier), uint(SynthekeContract.BreachTier.NONE));
        assertEq(p.breachingParty, address(0));
        assertEq(p.cureDeadline, 0);
    }

    function test_confirmCure_byNonBreachingParty_reverts() public {
        bytes32 pactId = _activePact();
        vm.prank(monitor);
        syntheke.recordBreach(pactId, uint256(0x7), "payment failed", partyB);

        vm.prank(partyA);
        vm.expectRevert(SynthekeContract.NotBreachingParty.selector);
        syntheke.confirmCure(pactId);
    }

    function test_confirmCure_afterDeadline_reverts() public {
        bytes32 pactId = _activePact();
        vm.prank(monitor);
        syntheke.recordBreach(pactId, uint256(0x7), "payment failed", partyB);

        vm.roll(block.number + 101);
        vm.prank(partyB);
        vm.expectRevert(SynthekeContract.CureDeadlineExceeded.selector);
        syntheke.confirmCure(pactId);
    }

    function test_attestationBreach_defaultsToPartyB() public {
        bytes32 pactId = _activePact();
        vm.prank(monitor);
        syntheke.recordAttestation(
            pactId,
            uint256(0x7),
            SynthekeContract.SynthekeState.BREACHED,
            bytes32(uint256(1)),
            "breach"
        );
        assertEq(syntheke.getPactState(pactId).breachingParty, partyB);
    }
}
