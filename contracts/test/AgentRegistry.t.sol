// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;
    address public agent = makeAddr("agent");
    address public other = makeAddr("other");

    function setUp() public {
        registry = new AgentRegistry(address(0));
    }

    function test_RegisterAgent() public {
        bytes32[] memory caps = new bytes32[](2);
        caps[0] = keccak256("yield_optimization");
        caps[1] = keccak256("treasury_management");

        vm.prank(agent);
        registry.registerAgent(1, caps, "ipfs://metadata");

        AgentRegistry.AgentRecord memory record = registry.getAgent(agent);
        assertTrue(record.active);
        assertEq(record.erc8004TokenId, 1);
        assertEq(record.capabilityHashes.length, 2);
        assertEq(registry.getAgentCount(), 1);
    }

    function test_CannotRegisterTwice() public {
        vm.prank(agent);
        registry.registerAgent(1, new bytes32[](0), "");

        vm.prank(agent);
        vm.expectRevert(AgentRegistry.AlreadyRegistered.selector);
        registry.registerAgent(2, new bytes32[](0), "");
    }

    function test_UpdateCapabilities() public {
        vm.prank(agent);
        registry.registerAgent(1, new bytes32[](0), "");

        bytes32[] memory newCaps = new bytes32[](1);
        newCaps[0] = keccak256("risk_analysis");

        vm.prank(agent);
        registry.updateCapabilities(newCaps);

        assertEq(registry.getAgentCapabilities(agent).length, 1);
    }

    function test_SuspendAndReactivate() public {
        vm.prank(agent);
        registry.registerAgent(1, new bytes32[](0), "");

        vm.prank(agent);
        registry.suspendAgent(agent);

        assertFalse(registry.isAgentActive(agent));

        vm.prank(agent);
        registry.reactivateAgent();

        assertTrue(registry.isAgentActive(agent));
    }

    function test_AgentByToken() public {
        vm.prank(agent);
        registry.registerAgent(42, new bytes32[](0), "");

        assertEq(registry.getAgentByToken(42), agent);
    }
}
