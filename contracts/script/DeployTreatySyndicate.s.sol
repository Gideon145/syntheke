// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TreatySyndicate} from "../src/TreatySyndicate.sol";

/**
 * @title DeployTreatySyndicate
 * @notice Deploys the N-party TreatySyndicate (mini agent-DAO), wired to the
 *         ReputationOracle so syndicate breach verdicts slash portable
 *         reputation. Also registers the new contract as an extra writer on
 *         the oracle.
 *
 * Usage:
 *   forge script script/DeployTreatySyndicate.s.sol:DeployTreatySyndicate \
 *     --rpc-url xlayer_testnet --broadcast
 */
contract DeployTreatySyndicate is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address reputationOracle = vm.envOr(
            "REPUTATION_ORACLE_ADDRESS",
            address(0xfd61828f15fc98E1dcfE0dd6498AbEE6E003c1cf)
        );

        vm.startBroadcast(deployerKey);

        TreatySyndicate syndicate = new TreatySyndicate(reputationOracle);
        console.log("TreatySyndicate:", address(syndicate));

        vm.stopBroadcast();

        // (Registered as extra writer on the oracle after deploy —
        //  run script/RegisterSyndicateWriter.s.sol, or call
        //  ReputationOracle.setExtraWriter(syndicate, true) from owner.)
        console.log("Next: ReputationOracle.setExtraWriter(", address(syndicate), ", true)");
    }
}
