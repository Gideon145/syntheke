// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TreasuryVault} from "../src/TreasuryVault.sol";

/**
 * @title DeployTreasury
 * @notice Deploys the Syntheke TreasuryVault with a 0.01 OKL creation fee.
 *
 * Usage:
 *   forge script script/DeployTreasury.s.sol:DeployTreasury --rpc-url xlayer_testnet --broadcast
 */
contract DeployTreasury is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // 0.01 OKL creation fee
        uint256 feeAmount = 0.01 ether;

        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);

        TreasuryVault treasury = new TreasuryVault(feeAmount);

        vm.stopBroadcast();

        console.log("\n=== Treasury Deployed ===");
        console.log("TreasuryVault:", address(treasury));
        console.log("Fee Amount (wei):", feeAmount);
        console.log("Owner:", deployer);
    }
}
