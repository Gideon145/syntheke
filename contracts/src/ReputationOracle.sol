// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal v1 registry interface for fallback reads.
interface IReputationRegistryV1 {
    function getScore(address agent) external view returns (uint256);
}

/**
 * @title ReputationOracle
 * @notice Portable reputation oracle for AI agents on X Layer — v2.
 *
 * @dev The canonical on-chain reputation source for the Syntheke protocol.
 *      Any protocol on X Layer can call getReputation(agent) to gate access,
 *      underwrite risk, or rank counterparties. Backward-compatible with the
 *      v1 ReputationRegistry: if this oracle has no record for an agent, it
 *      falls back to the v1 registry score.
 *
 *      Scoring model:
 *      - ELO-style score, 0–10000 (5000 = neutral)
 *      - COMPLETED  → +K scaled by settlement fairness (K = 32)
 *      - BREACHED   → −2K
 *      - TERMINATED → +K/4
 *      - Tiers: UNRATED, RISKY, CAUTIOUS, NEUTRAL, RELIABLE, TRUSTED, ELITE
 *
 *      Writers: the Syntheke monitor agent records outcomes when a pact
 *      settles (after on-chain mediator voting). Readers: anyone, free.
 */
contract ReputationOracle {
    // ──── CONSTANTS ────────────────────────────────────────

    uint256 public constant NEUTRAL_SCORE = 5000;
    uint256 public constant MAX_SCORE = 10000;
    uint256 public constant K_FACTOR = 32;

    // ──── TYPES ────────────────────────────────────────────

    enum Tier {
        UNRATED, // 0: no history
        RISKY, // 1: < 4000
        CAUTIOUS, // 2: 4000–4999
        NEUTRAL, // 3: 5000–5999
        RELIABLE, // 4: 6000–7499
        TRUSTED, // 5: 7500–8999
        ELITE // 6: 9000+
    }

    struct Reputation {
        uint256 score; // ELO 0–10000
        Tier tier;
        uint256 pactCount;
        uint256 completedCount;
        uint256 breachedCount;
        uint256 terminatedCount;
        uint256 complianceBps; // completed / settled, in basis points
        uint256 lastUpdated;
    }

    struct OutcomeEvent {
        address agent;
        bytes32 pactId;
        string outcome; // "COMPLETED" | "BREACHED" | "TERMINATED"
        int256 delta;
        uint256 newScore;
        uint256 timestamp;
    }

    // ──── STORAGE ──────────────────────────────────────────

    address public owner;
    address public monitorAgent;
    IReputationRegistryV1 public registryV1;

    mapping(address => Reputation) public records;
    mapping(address => OutcomeEvent[]) public history;

    // ──── EVENTS ────────────────────────────────────────────

    event OutcomeRecorded(
        address indexed agent, bytes32 indexed pactId, string outcome, int256 delta, uint256 newScore
    );

    // ──── ERRORS ────────────────────────────────────────────

    error NotMonitor();
    error InvalidOutcome();

    // ──── MODIFIERS ─────────────────────────────────────────

    modifier onlyMonitor() {
        if (msg.sender != monitorAgent) revert NotMonitor();
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ──── CONSTRUCTOR ───────────────────────────────────────

    constructor(address _monitorAgent, address _registryV1) {
        owner = msg.sender;
        monitorAgent = _monitorAgent;
        registryV1 = IReputationRegistryV1(_registryV1);
    }

    function setMonitorAgent(address _m) external onlyOwner {
        monitorAgent = _m;
    }

    function setRegistryV1(address _r) external onlyOwner {
        registryV1 = IReputationRegistryV1(_r);
    }

    // ──── WRITE: settlement outcomes ────────────────────────

    /// @notice Record a pact outcome for one agent. Called by the monitor agent
    ///         when a pact settles. fairnessBps reflects the agent's share of
    ///         settlement (10000 = full amount, 0 = nothing).
    function recordOutcome(
        bytes32 pactId,
        address agent,
        string calldata outcome,
        uint256 fairnessBps
    )
        external
        onlyMonitor
        returns (uint256 newScore)
    {
        Reputation storage r = records[agent];
        if (r.lastUpdated == 0) r.score = NEUTRAL_SCORE;

        int256 delta;
        if (keccak256(bytes(outcome)) == keccak256(bytes("COMPLETED"))) {
            // Fair completion earns up to +K; unfair "completion" is penalized.
            if (fairnessBps >= 10000) {
                // forge-lint: disable-next-line(unsafe-typecast)
                delta = int256(K_FACTOR);
            } else if (fairnessBps >= 5000) {
                // forge-lint: disable-next-line(unsafe-typecast)
                delta = int256((K_FACTOR * (fairnessBps - 5000)) / 5000);
            } else {
                // forge-lint: disable-next-line(unsafe-typecast)
                delta = -int256((K_FACTOR * (5000 - fairnessBps)) / 5000);
            }
            r.completedCount++;
        } else if (keccak256(bytes(outcome)) == keccak256(bytes("BREACHED"))) {
            // forge-lint: disable-next-line(unsafe-typecast)
            delta = -int256(K_FACTOR * 2);
            r.breachedCount++;
        } else if (keccak256(bytes(outcome)) == keccak256(bytes("TERMINATED"))) {
            // forge-lint: disable-next-line(unsafe-typecast)
            delta = int256(K_FACTOR / 4);
            r.terminatedCount++;
        } else {
            revert InvalidOutcome();
        }

        // Apply delta with clamping
        if (delta > 0) {
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 up = r.score + uint256(delta);
            r.score = up > MAX_SCORE ? MAX_SCORE : up;
        } else {
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 absDelta = uint256(-delta);
            r.score = r.score > absDelta ? r.score - absDelta : 0;
        }

        r.pactCount++;
        r.lastUpdated = block.timestamp;

        uint256 settled = r.completedCount + r.breachedCount + r.terminatedCount;
        if (settled > 0) {
            r.complianceBps = (r.completedCount * 10000) / settled;
        }

        history[agent].push(
            OutcomeEvent({
                agent: agent,
                pactId: pactId,
                outcome: outcome,
                delta: delta,
                newScore: r.score,
                timestamp: block.timestamp
            })
        );

        emit OutcomeRecorded(agent, pactId, outcome, delta, r.score);
        return r.score;
    }

    // ──── READ: portable reputation ─────────────────────────

    /// @notice Main portable query — full reputation snapshot for any agent.
    function getReputation(address agent) public view returns (Reputation memory r) {
        r = records[agent];
        if (r.lastUpdated == 0 && address(registryV1) != address(0)) {
            // Fall back to v1 registry for continuity
            uint256 v1Score = registryV1.getScore(agent);
            if (v1Score > 0) {
                r.score = v1Score;
                r.lastUpdated = block.timestamp;
            }
        }
        r.tier = _tierFor(r.score, r.lastUpdated > 0);
    }

    function getScore(address agent) external view returns (uint256) {
        Reputation memory r = getReputation(agent);
        return r.lastUpdated == 0 ? NEUTRAL_SCORE : r.score;
    }

    function getTier(address agent) external view returns (Tier) {
        return getReputation(agent).tier;
    }

    /// @notice Compliance rate in basis points (completed / settled).
    function complianceScore(address agent) external view returns (uint256) {
        return getReputation(agent).complianceBps;
    }

    /// @notice Portable gate — other protocols call this to accept/reject agents.
    function isReputable(address agent, uint256 minScore) external view returns (bool) {
        Reputation memory r = getReputation(agent);
        if (r.lastUpdated == 0) return minScore <= NEUTRAL_SCORE;
        return r.score >= minScore;
    }

    function getHistory(address agent) external view returns (OutcomeEvent[] memory) {
        return history[agent];
    }

    function getHistoryLength(address agent) external view returns (uint256) {
        return history[agent].length;
    }

    /// @notice Protocol metadata for external integrations.
    function oracleInfo() external pure returns (string memory version, uint256 kFactor) {
        return ("syntheke-reputation-v2", K_FACTOR);
    }

    // ──── HELPERS ───────────────────────────────────────────

    function _tierFor(uint256 score, bool rated) internal pure returns (Tier) {
        if (!rated) return Tier.UNRATED;
        if (score >= 9000) return Tier.ELITE;
        if (score >= 7500) return Tier.TRUSTED;
        if (score >= 6000) return Tier.RELIABLE;
        if (score >= 5000) return Tier.NEUTRAL;
        if (score >= 4000) return Tier.CAUTIOUS;
        return Tier.RISKY;
    }
}
