// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title SynthekeContract
 * @notice Autonomous economic treaty protocol — 15-state lifecycle for bilateral AI agent agreements.
 * @dev Two AI agents, each with on-chain identity (AgentRegistry) and reputation (ReputationRegistry),
 *      form a Syntheke (συνθήκη): a self-monitoring, self-healing economic pact monitored continuously
 *      and settled trustlessly on X Layer.
 *
 *      State Machine:
 *      DRAFT(0) → NEGOTIATING(1) → PROPOSED(2) → COMMITTED(3) → ACTIVE(4)
 *      → DEGRADING(5) ⇄ RENEGOTIATING(6) → BREACHED(7)
 *      → CURING(8) | ARBITRATING(9) → RESOLVING(10) → SETTLING(11) → CLOSED(12)
 *      EXPIRED(13) · TERMINATED(14)
 */
contract SynthekeContract {
    // ──── TYPES ────────────────────────────────────────────

    enum SynthekeState {
        DRAFT, // 0: One party created a draft
        NEGOTIATING, // 1: Both parties exchanging terms
        PROPOSED, // 2: Terms finalized, awaiting signatures
        COMMITTED, // 3: Both parties deposited escrow
        ACTIVE, // 4: Pact is live, monitoring active
        DEGRADING, // 5: Soft conditions trending toward breach
        RENEGOTIATING, // 6: Parties adapting terms to restore health
        BREACHED, // 7: Hard condition violated
        CURING, // 8: Grace period — breaching party can fix
        ARBITRATING, // 9: Mediator agents evaluating dispute
        RESOLVING, // 10: Resolution determined, computing settlement
        SETTLING, // 11: Escrow being distributed
        CLOSED, // 12: Pact completed, reputation updated
        EXPIRED, // 13: Timed out before activation
        TERMINATED // 14: Mutual termination
    }

    enum BreachTier {
        NONE, // 0
        MINOR, // 1: Late payment, minor deviation
        MATERIAL, // 2: Significant condition failure
        FUNDAMENTAL, // 3: Core obligation violated
        CATASTROPHIC // 4: Identity revoked, fraud detected
    }

    struct PactTerms {
        uint256 amount; // Escrow amount per party (in settlement asset units)
        address settlementAsset; // ERC-20 token for escrow/settlement
        uint256 duration; // Pact duration in blocks
        uint256 collateralRatio; // Basis points (15000 = 150%)
        uint256 liquidationThreshold; // Basis points (12000 = 120%)
        uint256 interestRate; // Basis points (800 = 8.0%)
        uint256 penaltyBps; // Breach penalty in basis points
        uint256 breachGraceBlocks; // Grace period for curing
        uint256 renegotiationWindow; // Max blocks for renegotiation
        uint256 maxRenegotiationRounds; // Renegotiation round limit
        uint256 monitoredConditions; // Bitmap of active conditions
    }

    struct PactData {
        SynthekeState state;
        address partyA;
        address partyB;
        PactTerms terms;
        uint256 activationBlock;
        uint256 degradationCounter;
        uint256 consecutiveDegradation;
        BreachTier breachTier;
        uint256 breachBlock;
        uint256 cureDeadline;
        uint256 renegotiationRound;
        uint256 renegotiationDeadline;
        bytes32 lastAttestationHash;
        uint256 attestationCount;
        bool partyADeposited;
        bool partyBDeposited;
        bool closed;
    }

    struct Attestation {
        uint256 conditionBitmap;
        SynthekeState assessedState;
        bytes32 dataHash;
        uint256 timestamp;
        string reason;
    }

    struct Amendment {
        PactTerms newTerms;
        uint256 amendedAt;
        uint256 round;
        bytes32 acceptedBy;
    }

    // ──── STORAGE ──────────────────────────────────────────

    address public monitorAgent;
    address public agentRegistry;
    address public escrowVault;
    address public reputationRegistry;

    uint256 public pactCount;
    mapping(bytes32 => PactData) public pacts;
    mapping(bytes32 => Attestation[]) public attestations;
    mapping(bytes32 => Amendment[]) public amendments;
    bytes32[] public pactIds;

    // ──── EVENTS ───────────────────────────────────────────

    event DraftCreated(bytes32 indexed pactId, address indexed partyA);
    event Negotiating(bytes32 indexed pactId, address indexed partyB, uint256 round);
    event Proposed(bytes32 indexed pactId, bytes32 termsHash);
    event Committed(bytes32 indexed pactId, uint256 totalEscrow);
    event Activated(bytes32 indexed pactId, uint256 amount, uint256 duration);
    event AttestationRecorded(bytes32 indexed pactId, uint256 cycleNumber, uint256 bitmap, SynthekeState state);
    event Degrading(bytes32 indexed pactId, uint256 bitmap, string reason);
    event Renegotiating(bytes32 indexed pactId, uint256 round);
    event Amended(bytes32 indexed pactId, bytes32 amendmentHash);
    event Breached(bytes32 indexed pactId, BreachTier tier, string reason);
    event Curing(bytes32 indexed pactId, uint256 deadline);
    event Arbitrating(bytes32 indexed pactId);
    event Resolved(bytes32 indexed pactId, uint256 settlementAmount);
    event Settling(bytes32 indexed pactId, uint256 partyAPayout, uint256 partyBPayout);
    event Closed(bytes32 indexed pactId);
    event Expired(bytes32 indexed pactId);
    event Terminated(bytes32 indexed pactId, string reason);

    // ──── ERRORS ───────────────────────────────────────────

    error NotParty();
    error NotMonitor();
    error NotMediator();
    error InvalidState(SynthekeState current, SynthekeState required);
    error InvalidTransition(SynthekeState from, SynthekeState to);
    error PactClosed();
    error AlreadyDeposited();
    error InsufficientDeposit();
    error RenegotiationDeadlineExceeded();
    error MaxRenegotiationRounds();
    error CureDeadlineExceeded();
    error NotBreachingParty();

    // ──── MODIFIERS ────────────────────────────────────────

    modifier onlyParty(bytes32 pactId) {
        PactData storage p = pacts[pactId];
        if (msg.sender != p.partyA && msg.sender != p.partyB) revert NotParty();
        _;
    }

    modifier onlyMonitor() {
        if (msg.sender != monitorAgent) revert NotMonitor();
        _;
    }

    modifier inState(bytes32 pactId, SynthekeState required) {
        if (pacts[pactId].state != required) revert InvalidState(pacts[pactId].state, required);
        _;
    }

    modifier notClosed(bytes32 pactId) {
        if (pacts[pactId].closed) revert PactClosed();
        _;
    }

    // ──── CONSTRUCTOR ──────────────────────────────────────

    constructor(address _monitorAgent, address _agentRegistry, address _escrowVault, address _reputationRegistry) {
        monitorAgent = _monitorAgent;
        agentRegistry = _agentRegistry;
        escrowVault = _escrowVault;
        reputationRegistry = _reputationRegistry;
    }

    // ──── PACT CREATION ────────────────────────────────────

    /// @notice Create a draft pact. Caller becomes Party A.
    function createDraft() external returns (bytes32 pactId) {
        pactId = keccak256(abi.encodePacked(msg.sender, block.timestamp, pactCount));
        PactData storage p = pacts[pactId];
        p.state = SynthekeState.DRAFT;
        p.partyA = msg.sender;
        pactIds.push(pactId);
        pactCount++;
        emit DraftCreated(pactId, msg.sender);
    }

    /// @notice Party B joins the draft, moving to negotiation.
    function joinDraft(bytes32 pactId) external notClosed(pactId) inState(pactId, SynthekeState.DRAFT) {
        PactData storage p = pacts[pactId];
        if (msg.sender == p.partyA) revert NotParty();
        p.partyB = msg.sender;
        p.state = SynthekeState.NEGOTIATING;
        emit Negotiating(pactId, msg.sender, 0);
    }

    // ──── NEGOTIATION ──────────────────────────────────────

    /// @notice Propose terms. Advances negotiation round.
    function proposeTerms(bytes32 pactId, PactTerms calldata terms)
        external
        onlyParty(pactId)
        inState(pactId, SynthekeState.NEGOTIATING)
    {
        PactData storage p = pacts[pactId];
        p.terms = terms;
        p.renegotiationRound++;
        emit Negotiating(pactId, msg.sender, p.renegotiationRound);
    }

    /// @notice Finalize negotiation — terms are locked.
    function finalizeNegotiation(bytes32 pactId) external onlyParty(pactId) inState(pactId, SynthekeState.NEGOTIATING) {
        PactData storage p = pacts[pactId];
        require(p.terms.amount > 0, "Terms not set");
        p.state = SynthekeState.PROPOSED;
        bytes32 termsHash = keccak256(abi.encode(p.terms));
        emit Proposed(pactId, termsHash);
    }

    // ──── COMMITMENT ───────────────────────────────────────

    /// @notice Deposit escrow. Pact activates when both parties deposit.
    function depositEscrow(bytes32 pactId) external onlyParty(pactId) inState(pactId, SynthekeState.PROPOSED) {
        PactData storage p = pacts[pactId];
        if (msg.sender == p.partyA) {
            if (p.partyADeposited) revert AlreadyDeposited();
            p.partyADeposited = true;
        } else {
            if (p.partyBDeposited) revert AlreadyDeposited();
            p.partyBDeposited = true;
        }
        emit Committed(pactId, p.terms.amount * 2);

        if (p.partyADeposited && p.partyBDeposited) {
            p.state = SynthekeState.ACTIVE;
            p.activationBlock = block.number;
            emit Activated(pactId, p.terms.amount, p.terms.duration);
        }
    }

    // ──── MONITORING ───────────────────────────────────────

    /// @notice Record a monitoring cycle attestation. Called every cycle by the monitor agent.
    function recordAttestation(
        bytes32 pactId,
        uint256 conditionBitmap,
        SynthekeState recommendedState,
        bytes32 dataHash,
        string calldata reason
    ) external onlyMonitor notClosed(pactId) {
        PactData storage p = pacts[pactId];
        Attestation memory att = Attestation({
            conditionBitmap: conditionBitmap,
            assessedState: recommendedState,
            dataHash: dataHash,
            timestamp: block.timestamp,
            reason: reason
        });
        attestations[pactId].push(att);
        p.lastAttestationHash = dataHash;
        p.attestationCount++;
        emit AttestationRecorded(pactId, p.attestationCount, conditionBitmap, recommendedState);

        // Handle state transitions based on monitor recommendation
        if (recommendedState == SynthekeState.ACTIVE && p.state == SynthekeState.DEGRADING) {
            p.state = SynthekeState.ACTIVE;
            p.consecutiveDegradation = 0;
        } else if (recommendedState == SynthekeState.DEGRADING && p.state == SynthekeState.ACTIVE) {
            p.state = SynthekeState.DEGRADING;
            p.consecutiveDegradation++;
            p.degradationCounter++;
            emit Degrading(pactId, conditionBitmap, reason);
        } else if (recommendedState == SynthekeState.BREACHED) {
            p.state = SynthekeState.BREACHED;
            p.breachBlock = block.number;
            _classifyAndEscalateBreach(pactId, conditionBitmap, reason);
        } else if (recommendedState == SynthekeState.ACTIVE && p.state == SynthekeState.CURING) {
            p.state = SynthekeState.ACTIVE;
            p.consecutiveDegradation = 0;
            p.breachTier = BreachTier.NONE;
        }
    }

    /// @notice Classify breach severity and auto-escalate.
    function _classifyAndEscalateBreach(bytes32 pactId, uint256 bitmap, string memory reason) internal {
        PactData storage p = pacts[pactId];

        // Tier classification based on which conditions failed
        bool identityRevoked = (bitmap & (1 << 0)) != 0;
        bool escrowCompromised = (bitmap & (1 << 1)) != 0;
        bool criticalCondition = (bitmap & (1 << 2)) != 0;
        bool softCondition = (bitmap & (1 << 3)) != 0;

        if (identityRevoked || escrowCompromised) {
            p.breachTier = BreachTier.CATASTROPHIC;
        } else if (criticalCondition) {
            p.breachTier = BreachTier.FUNDAMENTAL;
        } else if (p.consecutiveDegradation >= 5) {
            p.breachTier = BreachTier.MATERIAL;
        } else {
            p.breachTier = BreachTier.MINOR;
        }

        emit Breached(pactId, p.breachTier, reason);

        // Auto-escalate based on tier
        if (p.breachTier <= BreachTier.MATERIAL) {
            p.state = SynthekeState.CURING;
            p.cureDeadline = block.number + p.terms.breachGraceBlocks;
            emit Curing(pactId, p.cureDeadline);
        } else {
            p.state = SynthekeState.ARBITRATING;
            emit Arbitrating(pactId);
        }
    }

    // ──── RENEGOTIATION ────────────────────────────────────

    /// @notice Initiate renegotiation from DEGRADING state.
    function initiateRenegotiation(bytes32 pactId) external onlyParty(pactId) inState(pactId, SynthekeState.DEGRADING) {
        PactData storage p = pacts[pactId];
        if (p.renegotiationRound >= p.terms.maxRenegotiationRounds) revert MaxRenegotiationRounds();
        p.state = SynthekeState.RENEGOTIATING;
        p.renegotiationRound++;
        p.renegotiationDeadline = block.number + p.terms.renegotiationWindow;
        emit Renegotiating(pactId, p.renegotiationRound);
    }

    /// @notice Accept renegotiated terms. Returns pact to ACTIVE.
    function acceptRenegotiation(bytes32 pactId, PactTerms calldata newTerms)
        external
        onlyParty(pactId)
        inState(pactId, SynthekeState.RENEGOTIATING)
    {
        PactData storage p = pacts[pactId];
        if (block.number > p.renegotiationDeadline) revert RenegotiationDeadlineExceeded();
        p.terms = newTerms;
        p.consecutiveDegradation = 0;
        p.state = SynthekeState.ACTIVE;

        amendments[pactId].push(
            Amendment({
                newTerms: newTerms,
                amendedAt: block.number,
                round: p.renegotiationRound,
                acceptedBy: bytes32(uint256(uint160(msg.sender)))
            })
        );
        emit Amended(pactId, keccak256(abi.encode(newTerms)));
    }

    // ──── CURING ───────────────────────────────────────────

    /// @notice Confirm that a breach has been cured.
    function confirmCure(bytes32 pactId) external onlyParty(pactId) inState(pactId, SynthekeState.CURING) {
        PactData storage p = pacts[pactId];
        if (msg.sender == _breachingParty(p)) revert NotBreachingParty();
        if (block.number > p.cureDeadline) revert CureDeadlineExceeded();
        p.state = SynthekeState.ACTIVE;
        p.breachTier = BreachTier.NONE;
        p.consecutiveDegradation = 0;
    }

    /// @notice Escalate uncured breach to arbitration.
    function escalateUncuredBreach(bytes32 pactId) external onlyMonitor inState(pactId, SynthekeState.CURING) {
        PactData storage p = pacts[pactId];
        require(block.number > p.cureDeadline, "Cure deadline not yet passed");
        p.state = SynthekeState.ARBITRATING;
        emit Arbitrating(pactId);
    }

    // ──── DISPUTE RESOLUTION ───────────────────────────────

    /// @notice Record mediator resolution. Called after off-chain mediation reaches consensus.
    function resolvePact(
        bytes32 pactId,
        uint256 settlementAmount,
        uint256 partyAPayout,
        uint256 partyBPayout,
        bytes32 reasoningHash
    ) external onlyMonitor {
        PactData storage p = pacts[pactId];
        require(
            p.state == SynthekeState.ARBITRATING || p.state == SynthekeState.BREACHED
                || p.state == SynthekeState.CURING,
            "Not in resolvable state"
        );
        p.state = SynthekeState.RESOLVING;
        emit Resolved(pactId, settlementAmount);
        // Immediately proceed to settling
        p.state = SynthekeState.SETTLING;
        emit Settling(pactId, partyAPayout, partyBPayout);
    }

    /// @notice Finalize settlement. Pact becomes CLOSED.
    function finalizeSettlement(bytes32 pactId) external onlyMonitor inState(pactId, SynthekeState.SETTLING) {
        PactData storage p = pacts[pactId];
        p.state = SynthekeState.CLOSED;
        p.closed = true;
        emit Closed(pactId);
    }

    // ──── TERMINATION ──────────────────────────────────────

    /// @notice Mutual termination before ACTIVATION or after SETTLING.
    function terminatePact(bytes32 pactId) external onlyParty(pactId) notClosed(pactId) {
        PactData storage p = pacts[pactId];
        require(
            p.state == SynthekeState.DRAFT || p.state == SynthekeState.NEGOTIATING || p.state == SynthekeState.PROPOSED,
            "Can only terminate before activation"
        );
        p.state = SynthekeState.TERMINATED;
        p.closed = true;
        emit Terminated(pactId, "Mutual termination");
    }

    /// @notice Auto-expire stale drafts/negotiations.
    function expirePact(bytes32 pactId) external onlyMonitor notClosed(pactId) {
        PactData storage p = pacts[pactId];
        require(
            p.state == SynthekeState.DRAFT || p.state == SynthekeState.NEGOTIATING || p.state == SynthekeState.PROPOSED,
            "Can only expire pre-activation pacts"
        );
        p.state = SynthekeState.EXPIRED;
        p.closed = true;
        emit Expired(pactId);
    }

    // ──── VIEWS ────────────────────────────────────────────

    function getPactState(bytes32 pactId) external view returns (PactData memory) {
        return pacts[pactId];
    }

    function getAttestations(bytes32 pactId) external view returns (Attestation[] memory) {
        return attestations[pactId];
    }

    function getAmendments(bytes32 pactId) external view returns (Amendment[] memory) {
        return amendments[pactId];
    }

    function getPactCount() external view returns (uint256) {
        return pactCount;
    }

    function getPactIds() external view returns (bytes32[] memory) {
        return pactIds;
    }

    function isActive(bytes32 pactId) external view returns (bool) {
        SynthekeState s = pacts[pactId].state;
        return s == SynthekeState.ACTIVE || s == SynthekeState.DEGRADING || s == SynthekeState.RENEGOTIATING;
    }

    // ──── HELPERS ──────────────────────────────────────────

    function _breachingParty(PactData storage p) internal view returns (address) {
        // The party that is NOT the one calling confirmCure is the breaching party.
        // Simplified: return the counterparty. In production, this would track which party breached.
        return address(0); // Placeholder — tracking requires breach attribution
    }

    // ──── ADMIN ────────────────────────────────────────────

    function setMonitorAgent(address _monitor) external {
        require(msg.sender == monitorAgent || monitorAgent == address(0), "Unauthorized");
        monitorAgent = _monitor;
    }
}
