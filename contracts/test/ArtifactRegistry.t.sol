// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ArtifactRegistry} from "../src/ArtifactRegistry.sol";

contract ArtifactRegistryTest is Test {
    ArtifactRegistry public registry;

    address owner = address(0xA11CE);
    bytes32 pactId = bytes32(uint256(42));

    function setUp() public {
        vm.prank(owner);
        registry = new ArtifactRegistry();
    }

    function test_RecordAndReadBack() public {
        bytes32 h = keccak256("contract text v1");
        vm.prank(owner);
        registry.recordArtifact(pactId, "contract-v1", h, "claude", 1);

        ArtifactRegistry.Artifact[] memory list = registry.getArtifacts(pactId);
        assertEq(list.length, 1);
        assertEq(list[0].hash, h);
        assertEq(keccak256(bytes(list[0].kind)), keccak256("contract-v1"));
        assertEq(list[0].producer, "claude");
        assertEq(list[0].version, 1);
        assertEq(registry.getArtifactCount(pactId), 1);
    }

    function test_VerifyFoundAndMissing() public {
        bytes32 h = keccak256("negotiation move");
        vm.prank(owner);
        registry.recordArtifact(pactId, "negotiation-move", h, "deepseek", 3);

        (bool found, uint256 v) = registry.verifyArtifact(pactId, h);
        assertTrue(found);
        assertEq(v, 3);

        (bool missing, uint256 v2) = registry.verifyArtifact(pactId, keccak256("other"));
        assertFalse(missing);
        assertEq(v2, 0);
    }

    function test_OnlyOwnerCanRecord() public {
        vm.expectRevert("not owner");
        registry.recordArtifact(pactId, "x", keccak256("y"), "z", 1);
    }

    function test_MultipleArtifactsOrdered() public {
        vm.startPrank(owner);
        registry.recordArtifact(pactId, "a", keccak256("1"), "p", 1);
        registry.recordArtifact(pactId, "b", keccak256("2"), "p", 1);
        registry.recordArtifact(pactId, "c", keccak256("3"), "p", 2);
        vm.stopPrank();

        ArtifactRegistry.Artifact[] memory list = registry.getArtifacts(pactId);
        assertEq(list.length, 3);
        assertEq(list[0].hash, keccak256("1"));
        assertEq(list[2].hash, keccak256("3"));
        assertEq(registry.getArtifactCount(pactId), 3);
    }
}
