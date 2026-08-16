// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {SynthekeContract} from "../src/SynthekeContract.sol";

/**
 * @title DeployV3
 * @notice Deploys SynthekeContract V3 (breach attribution + confirmCure fix)
 *         on X Layer mainnet, wired to the existing V2 stack:
 *           AgentRegistry, EscrowVaultV2, ReputationRegistry (unchanged).
 *
 * Env required: PRIVATE_KEY (deployer), V3_MONITOR (agent wallet),
 *               V3_REGISTRY, V3_ESCROW, V3_REPUTATION
 */
contract DeployV3 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address monitorAgent = vm.envAddress("V3_MONITOR");
        address registry = vm.envAddress("V3_REGISTRY");
        address escrow = vm.envAddress("V3_ESCROW");
        address reputation = vm.envAddress("V3_REPUTATION");

        console.log("Deployer:", vm.addr(deployerKey));
        console.log("Monitor:", monitorAgent);

        vm.startBroadcast(deployerKey);
        SynthekeContract syntheke = new SynthekeContract(monitorAgent, registry, escrow, reputation);
        vm.stopBroadcast();

        console.log("SynthekeContract V3:", address(syntheke));
    }
}
