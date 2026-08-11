// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {EscrowVault} from "../src/EscrowVault.sol";

contract EscrowVaultTest is Test {
    EscrowVault public vault;

    function setUp() public {
        vault = new EscrowVault();
        vault.setSynthekeContract(address(this));
    }

    function test_SetSynthekeContractOnce() public {
        vm.expectRevert("Already set");
        vault.setSynthekeContract(address(0x1));
    }

    function test_OnlySynthekeCanDeposit() public {
        vm.prank(makeAddr("rando"));
        vm.expectRevert(EscrowVault.NotSynthekeContract.selector);
        vault.deposit(bytes32(0), makeAddr("p"), address(0), 100);
    }

    function test_TVLUpdates() public {
        assertEq(vault.getTVL(), 0);
    }

    function test_RecoverTokensOnlyOwner() public {
        vm.prank(makeAddr("rando"));
        vm.expectRevert("Not owner");
        vault.recoverTokens(address(0x1), makeAddr("r"), 100);
    }
}
