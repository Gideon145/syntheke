// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title EscrowVault
 * @notice Custody layer for Syntheke pact funds. Holds escrow until settlement conditions are met.
 * @dev Pull-over-push pattern for withdrawals. Only SynthekeContract can instruct fund movement.
 *      Deposits are per-pact, per-party. Funds released on settlement, refunded on termination.
 */
contract EscrowVault is ReentrancyGuard {
    // ──── TYPES ────────────────────────────────────────────

    struct EscrowPosition {
        bytes32 pactId;
        address partyA;
        address partyB;
        address asset;
        uint256 amountA;
        uint256 amountB;
        uint256 totalDeposited;
        bool settled;
        bool refunded;
    }

    // ──── STORAGE ──────────────────────────────────────────

    address public synthekeContract;
    address public owner;

    mapping(bytes32 => EscrowPosition) public positions;
    mapping(address => mapping(address => uint256)) public vaultBalances; // asset => depositor => balance

    uint256 public totalValueLocked;

    // ──── EVENTS ───────────────────────────────────────────

    event Deposited(bytes32 indexed pactId, address indexed party, address asset, uint256 amount);
    event Released(bytes32 indexed pactId, address indexed recipient, address asset, uint256 amount);
    event Refunded(bytes32 indexed pactId, address indexed party, address asset, uint256 amount);
    event Slashed(bytes32 indexed pactId, address indexed from, address indexed to, address asset, uint256 amount);

    // ──── ERRORS ───────────────────────────────────────────

    error NotSynthekeContract();
    error AlreadyDeposited();
    error AlreadySettled();
    error InsufficientBalance();
    error InvalidAsset();
    error TransferFailed();

    // ──── MODIFIERS ────────────────────────────────────────

    modifier onlySyntheke() {
        if (msg.sender != synthekeContract) revert NotSynthekeContract();
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ──── CONSTRUCTOR ──────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    /// @notice Set the authorized SynthekeContract address.
    function setSynthekeContract(address _syntheke) external onlyOwner {
        require(synthekeContract == address(0), "Already set");
        synthekeContract = _syntheke;
    }

    // ──── DEPOSIT ──────────────────────────────────────────

    /// @notice Deposit escrow for a pact. Called by SynthekeContract on behalf of a party.
    function deposit(bytes32 pactId, address party, address asset, uint256 amount) external onlySyntheke nonReentrant {
        EscrowPosition storage pos = positions[pactId];

        // Initialize position on first deposit
        if (pos.pactId == bytes32(0)) {
            pos.pactId = pactId;
            pos.asset = asset;
        }

        if (pos.settled || pos.refunded) revert AlreadySettled();

        // Pull funds from party
        bool success = IERC20(asset).transferFrom(party, address(this), amount);
        if (!success) revert TransferFailed();

        if (party == pos.partyA || pos.partyA == address(0)) {
            if (pos.partyA == address(0)) pos.partyA = party;
            if (pos.amountA > 0) revert AlreadyDeposited();
            pos.amountA = amount;
        } else {
            if (pos.partyB == address(0)) pos.partyB = party;
            if (pos.amountB > 0) revert AlreadyDeposited();
            pos.amountB = amount;
        }

        pos.totalDeposited += amount;
        vaultBalances[asset][party] += amount;
        totalValueLocked += amount;

        emit Deposited(pactId, party, asset, amount);
    }

    // ──── RELEASE ──────────────────────────────────────────

    /// @notice Release escrow funds to a party on settlement.
    function release(bytes32 pactId, address recipient, uint256 amount) external onlySyntheke nonReentrant {
        EscrowPosition storage pos = positions[pactId];
        if (pos.settled) revert AlreadySettled();

        pos.settled = true;

        bool success = IERC20(pos.asset).transfer(recipient, amount);
        if (!success) revert TransferFailed();

        vaultBalances[pos.asset][recipient] -= amount;
        totalValueLocked -= amount;

        emit Released(pactId, recipient, pos.asset, amount);
    }

    // ──── REFUND ───────────────────────────────────────────

    /// @notice Refund escrow to a party (mutual termination or expiry).
    function refund(bytes32 pactId, address party, uint256 amount) external onlySyntheke nonReentrant {
        EscrowPosition storage pos = positions[pactId];
        if (pos.refunded) revert AlreadySettled();

        pos.refunded = true;

        bool success = IERC20(pos.asset).transfer(party, amount);
        if (!success) revert TransferFailed();

        vaultBalances[pos.asset][party] -= amount;
        totalValueLocked -= amount;

        emit Refunded(pactId, party, pos.asset, amount);
    }

    // ──── SLASH ────────────────────────────────────────────

    /// @notice Slash breaching party's deposit and transfer to counterparty.
    function slash(bytes32 pactId, address from, address to, uint256 amount) external onlySyntheke nonReentrant {
        EscrowPosition storage pos = positions[pactId];

        bool success = IERC20(pos.asset).transfer(to, amount);
        if (!success) revert TransferFailed();

        vaultBalances[pos.asset][from] -= amount;
        totalValueLocked -= amount;

        emit Slashed(pactId, from, to, pos.asset, amount);
    }

    // ──── VIEWS ────────────────────────────────────────────

    function getPosition(bytes32 pactId) external view returns (EscrowPosition memory) {
        return positions[pactId];
    }

    function getBalance(address asset, address party) external view returns (uint256) {
        return vaultBalances[asset][party];
    }

    function getTVL() external view returns (uint256) {
        return totalValueLocked;
    }

    // ──── ADMIN ────────────────────────────────────────────

    /// @notice Recover accidentally sent tokens (not escrow funds).
    function recoverTokens(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        IERC20(token).transfer(to, amount);
    }

    /// @notice Allow contract to receive native currency.
    receive() external payable {}
}
