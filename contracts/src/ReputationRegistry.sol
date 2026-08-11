// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title ReputationRegistry
 * @notice On-chain ELO-based reputation scoring for AI agents.
 * @dev Updated atomically with pact settlement. Scores range 0-10000 (5000 = neutral).
 *      Non-transferable. Decays toward neutral on inactivity.
 *      Sybil-resistant via rapid-pact detection and completion-count-weighted K-factor.
 */
contract ReputationRegistry {
    // ──── CONSTANTS ────────────────────────────────────────

    uint256 public constant NEUTRAL_SCORE = 5000;
    uint256 public constant MAX_SCORE = 10000;
    uint256 public constant MIN_SCORE = 0;
    uint256 public constant DECAY_RATE = 100; // Basis points per month (1%)
    uint256 public constant DECAY_PERIOD = 30 days;
    uint256 public constant RAPID_PACT_THRESHOLD = 3; // Pacts with same counterparty in 7 days

    // ──── TYPES ────────────────────────────────────────────

    struct ReputationRecord {
        uint256 score; // 0-10000
        uint256 pactCount; // Total pacts participated in
        uint256 completedCount; // Successfully completed
        uint256 breachedCount; // Breaches attributed
        uint256 terminatedCount; // Mutually terminated
        uint256 lastUpdated;
        uint256 lastPactTimestamp;
        address lastCounterparty;
        uint256 rapidPactCount;
    }

    struct ReputationEvent {
        address agent;
        bytes32 pactId;
        string eventType; // COMPLETED, BREACHED, TERMINATED
        int256 scoreDelta;
        uint256 newScore;
        uint256 timestamp;
    }

    // ──── STORAGE ──────────────────────────────────────────

    address public synthekeContract;
    address public owner;

    mapping(address => ReputationRecord) public records;
    mapping(address => ReputationEvent[]) public history;

    // ──── EVENTS ───────────────────────────────────────────

    event ReputationUpdated(
        address indexed agent, bytes32 indexed pactId, string eventType, int256 delta, uint256 newScore
    );

    // ──── ERRORS ───────────────────────────────────────────

    error NotSynthekeContract();
    error NotRegistered();

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

    function setSynthekeContract(address _syntheke) external onlyOwner {
        require(synthekeContract == address(0), "Already set");
        synthekeContract = _syntheke;
    }

    // ──── SCORING ──────────────────────────────────────────

    /// @notice Update reputation after pact closure. Called by SynthekeContract.
    function updateReputation(
        address agent,
        bytes32 pactId,
        string calldata eventType, // "COMPLETED", "BREACHED", "TERMINATED"
        address counterparty
    )
        external
        onlySyntheke
        returns (uint256 newScore)
    {
        ReputationRecord storage record = records[agent];
        if (record.lastUpdated == 0) {
            // Initialize
            record.score = NEUTRAL_SCORE;
        }

        // Apply time decay before update
        _applyDecay(agent);

        // Detect rapid pacts with same counterparty
        if (counterparty == record.lastCounterparty && block.timestamp - record.lastPactTimestamp < 7 days) {
            record.rapidPactCount++;
        } else {
            record.rapidPactCount = 0;
        }

        // Compute K-factor (decreases with experience, penalized for rapid pacts)
        uint256 k = _computeKFactor(record);

        int256 delta;
        if (keccak256(bytes(eventType)) == keccak256(bytes("COMPLETED"))) {
            delta = int256(k);
            record.completedCount++;
        } else if (keccak256(bytes(eventType)) == keccak256(bytes("BREACHED"))) {
            delta = -int256(k * 2);
            record.breachedCount++;
        } else if (keccak256(bytes(eventType)) == keccak256(bytes("TERMINATED"))) {
            delta = int256(k / 4);
            record.terminatedCount++;
        } else {
            delta = 0;
        }

        // Apply delta with clamping
        if (delta > 0) {
            record.score = _min(MAX_SCORE, record.score + uint256(delta));
        } else {
            uint256 absDelta = uint256(-delta);
            record.score = record.score > absDelta ? record.score - absDelta : MIN_SCORE;
        }

        record.pactCount++;
        record.lastUpdated = block.timestamp;
        record.lastPactTimestamp = block.timestamp;
        record.lastCounterparty = counterparty;

        // Record history
        history[agent].push(
            ReputationEvent({
                agent: agent,
                pactId: pactId,
                eventType: eventType,
                scoreDelta: delta,
                newScore: record.score,
                timestamp: block.timestamp
            })
        );

        emit ReputationUpdated(agent, pactId, eventType, delta, record.score);
        return record.score;
    }

    // ──── DECAY ────────────────────────────────────────────

    function _applyDecay(address agent) internal {
        ReputationRecord storage record = records[agent];
        if (record.lastUpdated == 0) return;

        uint256 elapsed = block.timestamp - record.lastUpdated;
        if (elapsed < DECAY_PERIOD) return;

        // Decay: move toward NEUTRAL_SCORE by DECAY_RATE bps per period
        uint256 periods = elapsed / DECAY_PERIOD;
        // Cap at 12 periods (1 year)
        for (uint256 i = 0; i < periods && i < 12; i++) {
            if (record.score > NEUTRAL_SCORE) {
                uint256 decay = (record.score - NEUTRAL_SCORE) * DECAY_RATE / 10000;
                record.score -= _min(decay, record.score - NEUTRAL_SCORE);
            } else if (record.score < NEUTRAL_SCORE) {
                uint256 decay = (NEUTRAL_SCORE - record.score) * DECAY_RATE / 10000;
                record.score += _min(decay, NEUTRAL_SCORE - record.score);
            }
        }
        record.lastUpdated = block.timestamp;
    }

    // ──── K-FACTOR ─────────────────────────────────────────

    function _computeKFactor(ReputationRecord storage record) internal view returns (uint256) {
        // Base K = 50
        // Decreases by 1 per 10 completed pacts (min 10)
        uint256 baseK = 50;
        uint256 reduction = record.completedCount / 10;
        uint256 k = baseK > reduction ? baseK - reduction : 10;

        // Penalize rapid pacts: halve K if rapidPactCount > threshold
        if (record.rapidPactCount > RAPID_PACT_THRESHOLD) {
            k = k / 2;
        }

        return k;
    }

    // ──── VIEWS ────────────────────────────────────────────

    function getReputation(address agent) external view returns (ReputationRecord memory) {
        return records[agent];
    }

    function getScore(address agent) external view returns (uint256) {
        return records[agent].score;
    }

    function getHistory(address agent) external view returns (ReputationEvent[] memory) {
        return history[agent];
    }

    function getHistoryLength(address agent) external view returns (uint256) {
        return history[agent].length;
    }

    function isReputable(address agent, uint256 minScore) external view returns (bool) {
        ReputationRecord storage record = records[agent];
        if (record.lastUpdated == 0) return minScore <= NEUTRAL_SCORE;
        return record.score >= minScore;
    }

    // ──── HELPERS ──────────────────────────────────────────

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
