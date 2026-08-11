// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

/**
 * Quick script to activate a test pact on X Layer testnet.
 * Usage:
 *   forge script script/ActivatePact.s.sol:ActivatePact --rpc-url https://testrpc.xlayer.tech --broadcast
 */
contract ActivatePact is Script {
    function run() external {
        address contractAddr = 0xe465405380E2E0f625028447E85917662E71ad42;
        bytes32 pactId = 0x365dfc4c240cb79379fb9953af1ee5635ea6e392fc97830dcc27f077602a11e0;

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        uint256 partyBKey = uint256(vm.envBytes32("PARTY_B_KEY"));

        vm.startBroadcast(deployerKey);

        // Propose terms as Party A
        SynthekeContract.PactTerms memory terms = SynthekeContract.PactTerms({
            amount: 1000 ether,
            settlementAsset: address(0),
            duration: 10000,
            collateralRatio: 15000,
            liquidationThreshold: 12000,
            interestRate: 800,
            penaltyBps: 500,
            breachGraceBlocks: 1440,
            renegotiationWindow: 720,
            maxRenegotiationRounds: 3,
            monitoredConditions: 0x7FF // all 11 conditions
        });

        SynthekeContract(contractAddr).proposeTerms(pactId, terms);
        console.log("1. Terms proposed (NEGOTIATING)");
        vm.stopBroadcast();

        // Finalize as Party B
        vm.startBroadcast(partyBKey);
        SynthekeContract(contractAddr).finalizeNegotiation(pactId);
        console.log("2. Negotiation finalized (to PROPOSED)");
        vm.stopBroadcast();

        // Deposit Party A
        vm.startBroadcast(deployerKey);
        SynthekeContract(contractAddr).depositEscrow(pactId);
        console.log("3. Party A deposited");
        vm.stopBroadcast();

        // Deposit Party B
        vm.startBroadcast(partyBKey);
        SynthekeContract(contractAddr).depositEscrow(pactId);
        console.log("4. Party B deposited (to ACTIVE)");
        vm.stopBroadcast();

        console.log("Pact should now be ACTIVE");
    }
}

interface SynthekeContract {
    struct PactTerms {
        uint256 amount;
        address settlementAsset;
        uint256 duration;
        uint256 collateralRatio;
        uint256 liquidationThreshold;
        uint256 interestRate;
        uint256 penaltyBps;
        uint256 breachGraceBlocks;
        uint256 renegotiationWindow;
        uint256 maxRenegotiationRounds;
        uint256 monitoredConditions;
    }
    function proposeTerms(bytes32 pactId, PactTerms calldata terms) external;
    function finalizeNegotiation(bytes32 pactId) external;
    function depositEscrow(bytes32 pactId) external;
}
