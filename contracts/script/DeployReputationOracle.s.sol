// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ReputationOracle} from "../src/ReputationOracle.sol";

/**
 * @title DeployReputationOracle
 * @notice Deploys the portable ReputationOracle (v2), wired to the monitor
 *         agent wallet and the legacy v1 ReputationRegistry for fallback.
 *
 * Usage:
 *   forge script script/DeployReputationOracle.s.sol:DeployReputationOracle \
 *     --rpc-url xlayer_testnet --broadcast
 */
contract DeployReputationOracle is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address monitorAgent = vm.envOr("MONITOR_AGENT_ADDRESS", deployer);
        address registryV1 = vm.envOr("REPUTATION_REGISTRY_V1", address(0));

        console.log("Deployer:", deployer);
        console.log("Monitor Agent:", monitorAgent);
        console.log("Registry V1 fallback:", registryV1);

        vm.startBroadcast(deployerKey);

        ReputationOracle oracle = new ReputationOracle(monitorAgent, registryV1);
        console.log("ReputationOracle:", address(oracle));

        vm.stopBroadcast();
    }
}
