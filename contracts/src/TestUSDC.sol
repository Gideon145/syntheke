// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestUSDC
 * @notice Mock USDC (6 decimals) for Syntheke treaty escrow on testnet.
 * @dev Anyone can mint — testnet only. Mirrors USDC's 6-decimal precision so
 *      escrow amounts read naturally (e.g. "10.00" = 10_000_000 units).
 */
contract TestUSDC is ERC20 {
    constructor() ERC20("Test USD Coin", "TestUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
