// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TestUSDC3009} from "../src/TestUSDC3009.sol";
import {MediatorVotes} from "../src/MediatorVotes.sol";

/**
 * @title DeployBatch2
 * @notice Deploys Batch 2 contracts:
 *   - TestUSDC3009 — EIP-3009 mock USDC for x402 payments
 *   - MediatorVotes — on-chain commit-reveal mediator voting
 *
 * Usage:
 *   forge script script/DeployBatch2.s.sol:DeployBatch2 --rpc-url xlayer_testnet --broadcast
 */
contract DeployBatch2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        address themis = vm.envAddress("THEMIS_ADDRESS");
        address athena = vm.envAddress("ATHENA_ADDRESS");
        address solon = vm.envAddress("SOLON_ADDRESS");

        vm.startBroadcast(deployerKey);

        TestUSDC3009 usdc = new TestUSDC3009();
        console.log("TestUSDC3009:", address(usdc));

        address[] memory mediators = new address[](3);
        mediators[0] = themis;
        mediators[1] = athena;
        mediators[2] = solon;

        MediatorVotes votes = new MediatorVotes(mediators);
        console.log("MediatorVotes:", address(votes));

        vm.stopBroadcast();
    }
}
