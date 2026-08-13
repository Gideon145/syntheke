// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MediatorStaking} from "../src/MediatorStaking.sol";

/**
 * @title DeployMediatorStaking
 * @notice Deploys the MediatorStaking contract with 20% slash rate.
 *
 * Usage:
 *   forge script script/DeployMediatorStaking.s.sol:DeployMediatorStaking --rpc-url xlayer_testnet --broadcast
 */
contract DeployMediatorStaking is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // 20% slash per wrong verdict
        uint256 slashPercent = 2000;

        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);

        MediatorStaking staking = new MediatorStaking(slashPercent);

        vm.stopBroadcast();

        console.log("\n=== MediatorStaking Deployed ===");
        console.log("MediatorStaking:", address(staking));
        console.log("Slash Percent:", slashPercent, "bps");
    }
}
