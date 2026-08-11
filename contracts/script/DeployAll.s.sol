// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {SynthekeContract} from "../src/SynthekeContract.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

/**
 * @title DeployAll
 * @notice Deploys the complete Syntheke protocol: EscrowVault, AgentRegistry,
 *         ReputationRegistry, and SynthekeContract — wired together.
 *
 * Usage:
 *   forge script script/DeployAll.s.sol:DeployAll --rpc-url anvil --broadcast
 *   forge script script/DeployAll.s.sol:DeployAll --rpc-url xlayer_testnet --broadcast --verify
 */
contract DeployAll is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address monitorAgent = vm.envOr("MONITOR_AGENT_ADDRESS", deployer);
        address erc8004Addr = vm.envOr("ERC8004_ADDRESS", address(0));

        console.log("Deployer:", deployer);
        console.log("Monitor Agent:", monitorAgent);

        vm.startBroadcast(deployerKey);

        // 1. Deploy EscrowVault
        EscrowVault escrow = new EscrowVault();
        console.log("EscrowVault:", address(escrow));

        // 2. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry(erc8004Addr);
        console.log("AgentRegistry:", address(registry));

        // 3. Deploy ReputationRegistry
        ReputationRegistry reputation = new ReputationRegistry();
        console.log("ReputationRegistry:", address(reputation));

        // 4. Deploy SynthekeContract — wired to all three
        SynthekeContract syntheke =
            new SynthekeContract(monitorAgent, address(registry), address(escrow), address(reputation));
        console.log("SynthekeContract:", address(syntheke));

        // 5. Wire EscrowVault ← SynthekeContract
        escrow.setSynthekeContract(address(syntheke));

        // 6. Wire ReputationRegistry ← SynthekeContract
        reputation.setSynthekeContract(address(syntheke));

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("SynthekeContract:", address(syntheke));
        console.log("AgentRegistry:   ", address(registry));
        console.log("EscrowVault:     ", address(escrow));
        console.log("ReputationRegistry:", address(reputation));
    }
}
