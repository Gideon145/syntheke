// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title EscrowVaultV2
 * @notice Real custody for Syntheke treaty escrow — v2.
 *
 * @dev v1 (EscrowVault) was wired to the first pact contract and its access
 *      control is immutable. This vault is driven directly by the Syntheke
 *      monitor agent (owner) on behalf of treaty parties: deposits pull real
 *      ERC-20 escrow from each party, and settlement distributes real funds
 *      per the on-chain mediator verdict. Every movement is an event.
 */
contract EscrowVaultV2 is ReentrancyGuard {
    struct EscrowPosition {
        bytes32 pactId;
        address partyA;
        address partyB;
        address asset;
        uint256 amountA;
        uint256 amountB;
        uint256 totalDeposited;
        bool settled;
    }

    address public owner;

    mapping(bytes32 => EscrowPosition) public positions;
    bytes32[] public pactIds;
    uint256 public totalValueLocked;
    uint256 public settledCount;

    event Deposited(bytes32 indexed pactId, address indexed party, address asset, uint256 amount);
    event Settled(bytes32 indexed pactId, address indexed recipientA, uint256 amountA, address indexed recipientB, uint256 amountB);
    event Slashed(bytes32 indexed pactId, address indexed from, address indexed to, address asset, uint256 amount);
    event Refunded(bytes32 indexed pactId, address indexed party, address asset, uint256 amount);

    error NotOwner();
    error AlreadyDeposited();
    error AlreadySettled();
    error InvalidAmounts();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setOwner(address _owner) external onlyOwner {
        owner = _owner;
    }

    /// @notice Pull one party's escrow into the vault. Caller (monitor agent)
    ///         must have arranged the ERC-20 approval first.
    function deposit(bytes32 pactId, address party, address asset, uint256 amount) external onlyOwner nonReentrant {
        EscrowPosition storage pos = positions[pactId];
        if (pos.settled) revert AlreadySettled();

        if (pos.pactId == bytes32(0)) {
            pos.pactId = pactId;
            pos.asset = asset;
            pactIds.push(pactId);
        } else if (pos.asset != asset) {
            revert InvalidAmounts();
        }

        if (pos.partyA == address(0)) {
            pos.partyA = party;
            pos.amountA = amount;
        } else if (pos.partyB == address(0)) {
            pos.partyB = party;
            pos.amountB = amount;
        } else {
            revert AlreadyDeposited();
        }

        bool success = IERC20(asset).transferFrom(party, address(this), amount);
        if (!success) revert TransferFailed();

        pos.totalDeposited += amount;
        totalValueLocked += amount;

        emit Deposited(pactId, party, asset, amount);
    }

    /// @notice Distribute escrow on settlement. Only owner (monitor agent),
    ///         which computes payouts from the on-chain mediator verdict.
    function settle(
        bytes32 pactId,
        address recipientA,
        uint256 amountA,
        address recipientB,
        uint256 amountB
    ) external onlyOwner nonReentrant {
        EscrowPosition storage pos = positions[pactId];
        if (pos.settled) revert AlreadySettled();
        if (amountA + amountB != pos.totalDeposited) revert InvalidAmounts();

        pos.settled = true;
        settledCount++;
        totalValueLocked -= pos.totalDeposited;

        if (amountA > 0) {
            bool okA = IERC20(pos.asset).transfer(recipientA, amountA);
            if (!okA) revert TransferFailed();
        }
        if (amountB > 0) {
            bool okB = IERC20(pos.asset).transfer(recipientB, amountB);
            if (!okB) revert TransferFailed();
        }

        emit Settled(pactId, recipientA, amountA, recipientB, amountB);
    }

    /// @notice Penalty transfer: move a portion of one party's share to the other.
    function slash(bytes32 pactId, address from, address to, uint256 amount) external onlyOwner nonReentrant {
        bool success = IERC20(positions[pactId].asset).transfer(to, amount);
        if (!success) revert TransferFailed();
        totalValueLocked -= amount;
        emit Slashed(pactId, from, to, positions[pactId].asset, amount);
    }

    /// @notice Full refund to both parties (mutual termination / expiry).
    function refundBoth(bytes32 pactId, address partyA, address partyB) external onlyOwner nonReentrant {
        EscrowPosition storage pos = positions[pactId];
        if (pos.settled) revert AlreadySettled();
        pos.settled = true;
        totalValueLocked -= pos.totalDeposited;

        if (pos.amountA > 0) {
            bool okA = IERC20(pos.asset).transfer(partyA, pos.amountA);
            if (!okA) revert TransferFailed();
        }
        if (pos.amountB > 0) {
            bool okB = IERC20(pos.asset).transfer(partyB, pos.amountB);
            if (!okB) revert TransferFailed();
        }

        emit Refunded(pactId, partyA, pos.asset, pos.totalDeposited);
    }

    function getPosition(bytes32 pactId) external view returns (EscrowPosition memory) {
        return positions[pactId];
    }

    function getPactIds() external view returns (bytes32[] memory) {
        return pactIds;
    }

    function getTVL() external view returns (uint256) {
        return totalValueLocked;
    }

    receive() external payable {}
}
