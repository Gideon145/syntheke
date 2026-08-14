// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MediatorVotes} from "../src/MediatorVotes.sol";

/**
 * @title DeployMediatorVotes
 * @notice Deploys only MediatorVotes (used after the combined script's second
 *         tx hit a nonce error — TestUSDC3009 already deployed).
 *
 * Usage:
 *   forge script script/DeployMediatorVotes.s.sol:DeployMediatorVotes --rpc-url xlayer_testnet --broadcast
 */
contract DeployMediatorVotes is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        address themis = vm.envAddress("THEMIS_ADDRESS");
        address athena = vm.envAddress("ATHENA_ADDRESS");
        address solon = vm.envAddress("SOLON_ADDRESS");

        vm.startBroadcast(deployerKey);

        address[] memory mediators = new address[](3);
        mediators[0] = themis;
        mediators[1] = athena;
        mediators[2] = solon;

        MediatorVotes votes = new MediatorVotes(mediators);
        console.log("MediatorVotes:", address(votes));

        vm.stopBroadcast();
    }
}
