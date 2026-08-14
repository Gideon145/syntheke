// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {EscrowVaultV2} from "../src/EscrowVaultV2.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {ReputationOracle} from "../src/ReputationOracle.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {SynthekeContract} from "../src/SynthekeContract.sol";
import {MediatorVotes} from "../src/MediatorVotes.sol";
import {MediatorStaking} from "../src/MediatorStaking.sol";
import {TreasuryVault} from "../src/TreasuryVault.sol";
import {ArtifactRegistry} from "../src/ArtifactRegistry.sol";
import {TreatySyndicate} from "../src/TreatySyndicate.sol";

/**
 * @title DeployMainnet
 * @notice Deploys the full Syntheke v2 stack to X Layer mainnet in one
 *         broadcast, mirroring the testnet architecture:
 *           EscrowVaultV2 (asset-agnostic; real USDT used per-deposit)
 *           ReputationRegistry (v1) -> ReputationOracle (v2)
 *           AgentRegistry (ERC-8004 hook disabled until mainnet address is set)
 *           SynthekeContract (monitor, registry, escrow, reputation)
 *           MediatorVotes, MediatorStaking, TreasuryVault,
 *           ArtifactRegistry, TreatySyndicate
 *
 * Usage:
 *   forge script script/DeployMainnet.s.sol:DeployMainnet \
 *     --rpc-url https://rpc.xlayer.tech --broadcast
 *
 * Env required: PRIVATE_KEY, THEMIS_ADDRESS, ATHENA_ADDRESS, SOLON_ADDRESS
 * Env optional: MAINNET_MONITOR_ADDRESS (defaults to deployer)
 */
contract DeployMainnet is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address monitorAgent = vm.envOr("MAINNET_MONITOR_ADDRESS", deployer);
        address themis = vm.envAddress("THEMIS_ADDRESS");
        address athena = vm.envAddress("ATHENA_ADDRESS");
        address solon = vm.envAddress("SOLON_ADDRESS");

        console.log("Deployer:", deployer);
        console.log("Monitor Agent:", monitorAgent);

        vm.startBroadcast(deployerKey);

        // 1. EscrowVaultV2 — owner = deployer; deposits take any ERC20 asset
        EscrowVaultV2 escrow = new EscrowVaultV2();
        console.log("EscrowVaultV2:", address(escrow));

        // 2. ReputationRegistry (v1, used by SynthekeContract) + v2 Oracle
        ReputationRegistry reputation = new ReputationRegistry();
        console.log("ReputationRegistry:", address(reputation));

        ReputationOracle oracle = new ReputationOracle(monitorAgent, address(reputation));
        console.log("ReputationOracle:", address(oracle));

        // 3. AgentRegistry — ERC-8004 hook disabled on mainnet for now
        AgentRegistry registry = new AgentRegistry(address(0));
        console.log("AgentRegistry:", address(registry));

        // 4. SynthekeContract — core pact lifecycle
        SynthekeContract syntheke =
            new SynthekeContract(monitorAgent, address(registry), address(escrow), address(reputation));
        console.log("SynthekeContract:", address(syntheke));

        // 5. MediatorVotes — the 3 mediators from testnet (same wallets)
        address[] memory mediators = new address[](3);
        mediators[0] = themis;
        mediators[1] = athena;
        mediators[2] = solon;
        MediatorVotes votes = new MediatorVotes(mediators);
        console.log("MediatorVotes:", address(votes));

        // 6. MediatorStaking — 20% slash per wrong verdict (2000 bps)
        MediatorStaking staking = new MediatorStaking(2000);
        console.log("MediatorStaking:", address(staking));

        // 7. TreasuryVault — 0.01 OKB creation fee
        TreasuryVault treasury = new TreasuryVault(0.01 ether);
        console.log("TreasuryVault:", address(treasury));

        // 8. ArtifactRegistry
        ArtifactRegistry artifacts = new ArtifactRegistry();
        console.log("ArtifactRegistry:", address(artifacts));

        // 9. TreatySyndicate
        TreatySyndicate syndicate = new TreatySyndicate(address(oracle));
        console.log("TreatySyndicate:", address(syndicate));

        // 10. Wire ReputationRegistry -> SynthekeContract
        reputation.setSynthekeContract(address(syntheke));
        console.log("Wired ReputationRegistry.setSynthekeContract");

        vm.stopBroadcast();

        console.log("\n=== Syntheke MAINNET deployment complete ===");
    }
}
