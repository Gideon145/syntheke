// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {EscrowVaultV2} from "../src/EscrowVaultV2.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/**
 * @title DeployEscrowV2
 * @notice Deploys EscrowVaultV2 (real escrow custody) + TestUSDC (6-dec mock
 *         stablecoin for testnet treaty escrow).
 *
 * Usage:
 *   forge script script/DeployEscrowV2.s.sol:DeployEscrowV2 --rpc-url xlayer_testnet --broadcast
 */
contract DeployEscrowV2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        EscrowVaultV2 vault = new EscrowVaultV2();
        console.log("EscrowVaultV2:", address(vault));

        TestUSDC usdc = new TestUSDC();
        console.log("TestUSDC:", address(usdc));

        vm.stopBroadcast();
    }
}
