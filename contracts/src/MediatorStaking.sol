// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MediatorStaking
 * @notice Economic stakes for Syntheke's AI mediator swarm.
 *
 * Mediators (Themis, Athena, Solon) stake native token. After every dispute:
 *   - Mediators in the MINORITY (wrong verdict) get slashed
 *   - Slashed amount is distributed to the MAJORITY (correct verdict)
 *
 * This makes AI verdicts economically consequential — the same pattern
 * that secures other autonomous oracles.
 */
contract MediatorStaking {
    address public immutable owner;
    uint256 public slashPercent; // basis points (e.g. 2000 = 20%)
    uint256 public totalStaked;
    uint256 public totalSlashed;
    uint256 public verdictCount;

    mapping(address => uint256) public stakes;

    event Staked(address indexed mediator, uint256 amount);
    event Unstaked(address indexed mediator, uint256 amount);
    event Slashed(address indexed mediator, uint256 amount, bytes32 indexed pactId);
    event Rewarded(address indexed mediator, uint256 amount, bytes32 indexed pactId);
    event VerdictRecorded(bytes32 indexed pactId, uint256 majorityCount, uint256 minorityCount, uint256 slashedTotal);
    event SlashPercentUpdated(uint256 oldPercent, uint256 newPercent);

    constructor(uint256 _slashPercent) {
        owner = msg.sender;
        slashPercent = _slashPercent;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function stake() external payable {
        require(msg.value > 0, "zero stake");
        stakes[msg.sender] += msg.value;
        totalStaked += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function unstake(uint256 amount) external {
        require(stakes[msg.sender] >= amount, "insufficient stake");
        stakes[msg.sender] -= amount;
        totalStaked -= amount;
        emit Unstaked(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
    }

    /**
     * Record a verdict: slash minority, reward majority with the slashed amount.
     * Called by the protocol after AI consensus is reached.
     */
    function recordVerdict(
        bytes32 pactId,
        address[] calldata majority,
        address[] calldata minority
    ) external onlyOwner {
        require(majority.length > 0, "empty majority");

        uint256 slashedTotal = 0;

        // Slash each minority mediator
        for (uint256 i = 0; i < minority.length; i++) {
            address m = minority[i];
            uint256 st = stakes[m];
            if (st == 0) continue;
            uint256 slashAmount = (st * slashPercent) / 10000;
            if (slashAmount == 0) slashAmount = st; // small stakes: full slash
            stakes[m] -= slashAmount;
            totalStaked -= slashAmount;
            slashedTotal += slashAmount;
            totalSlashed += slashAmount;
            emit Slashed(m, slashAmount, pactId);
        }

        // Distribute slashed amount to majority
        if (slashedTotal > 0) {
            uint256 share = slashedTotal / majority.length;
            for (uint256 i = 0; i < majority.length; i++) {
                stakes[majority[i]] += share;
                totalStaked += share;
                emit Rewarded(majority[i], share, pactId);
            }
        }

        verdictCount++;
        emit VerdictRecorded(pactId, majority.length, minority.length, slashedTotal);
    }

    function setSlashPercent(uint256 _slashPercent) external onlyOwner {
        emit SlashPercentUpdated(slashPercent, _slashPercent);
        slashPercent = _slashPercent;
    }

    function getStake(address mediator) external view returns (uint256) {
        return stakes[mediator];
    }
}
