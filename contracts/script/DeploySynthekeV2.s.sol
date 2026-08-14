// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {SynthekeContract} from "../src/SynthekeContract.sol";

/**
 * @title DeploySynthekeV2
 * @notice Redeploys SynthekeContract with the Batch 5 lifecycle fixes
 *         (COMMITTED transition, cure-deadline persistence, no post-deadline
 *         self-heal) against the EXISTING registry/vault/reputation contracts.
 *
 * Usage:
 *   forge script script/DeploySynthekeV2.s.sol:DeploySynthekeV2 --rpc-url xlayer_testnet --broadcast
 */
contract DeploySynthekeV2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        address monitor = vm.envAddress("MONITOR_ADDRESS");
        address registry = vm.envAddress("AGENT_REGISTRY_ADDRESS");
        address vault = vm.envAddress("ESCROW_VAULT_ADDRESS");
        address reputation = vm.envAddress("REPUTATION_REGISTRY_ADDRESS");

        vm.startBroadcast(deployerKey);

        SynthekeContract c = new SynthekeContract(monitor, registry, vault, reputation);
        console.log("SynthekeContract:", address(c));

        vm.stopBroadcast();
    }
}
