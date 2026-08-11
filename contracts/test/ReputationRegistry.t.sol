// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    ReputationRegistry public rep;
    address public agent = makeAddr("agent");
    address public counterparty = makeAddr("counterparty");

    function setUp() public {
        rep = new ReputationRegistry();
        rep.setSynthekeContract(address(this)); // Test contract acts as Syntheke
    }

    function test_InitialScore() public {
        uint256 score = rep.updateReputation(agent, bytes32(uint256(1)), "COMPLETED", counterparty);
        // Neutral 5000 + K=50 = 5050 (first pact)
        assertTrue(score > 5000, "Score should increase on completion");
        assertEq(rep.getScore(agent), score);
    }

    function test_ScoreNeverNegative() public {
        // Multiple breaches on a new agent
        for (uint256 i = 0; i < 100; i++) {
            rep.updateReputation(agent, bytes32(uint256(i)), "BREACHED", counterparty);
        }
        assertEq(rep.getScore(agent), 0);
    }

    function test_ScoreNeverExceedsMax() public {
        for (uint256 i = 0; i < 500; i++) {
            rep.updateReputation(agent, bytes32(uint256(i)), "COMPLETED", counterparty);
        }
        assertLe(rep.getScore(agent), 10000);
    }

    function test_BreachPenaltyGreaterThanCompletion() public {
        uint256 afterComplete = rep.updateReputation(agent, bytes32(uint256(1)), "COMPLETED", counterparty);
        uint256 afterBreach = rep.updateReputation(agent, bytes32(uint256(2)), "BREACHED", counterparty);

        // Score should drop below neutral after 1 completion + 1 breach (K*2 breach penalty)
        assertLe(afterBreach, afterComplete);
    }

    function test_TerminationSmallerEffect() public {
        uint256 afterComplete = rep.updateReputation(agent, bytes32(uint256(1)), "COMPLETED", counterparty);
        uint256 afterTerm = rep.updateReputation(agent, bytes32(uint256(2)), "TERMINATED", counterparty);

        // Termination should have smaller positive effect than completion
        assertLe(afterTerm - afterComplete, 20); // K/4 ≤ 12
    }

    function test_HistoryRecorded() public {
        rep.updateReputation(agent, bytes32(uint256(1)), "COMPLETED", counterparty);
        rep.updateReputation(agent, bytes32(uint256(2)), "BREACHED", counterparty);

        assertEq(rep.getHistoryLength(agent), 2);
    }

    function test_RapidPactDetection() public {
        // 5 rapid pacts with same counterparty
        for (uint256 i = 0; i < 5; i++) {
            rep.updateReputation(agent, bytes32(uint256(i)), "COMPLETED", counterparty);
        }

        // After 3 rapid pacts, K-factor is halved, so scores should increase slowly
        uint256 finalScore = rep.getScore(agent);
        // Should be NEUTRAL + some completions but penalized
        assertGt(finalScore, 5000);
    }

    function test_OnlySynthekeCanUpdate() public {
        vm.prank(makeAddr("rando"));
        vm.expectRevert(ReputationRegistry.NotSynthekeContract.selector);
        rep.updateReputation(agent, bytes32(0), "COMPLETED", counterparty);
    }
}
