// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Syntheke ReputationOracle v2 — used to penalize slashed members.
interface IReputationOracleV2 {
    function recordOutcome(bytes32 pactId, address agent, string calldata outcome, uint256 fairnessBps)
        external
        returns (uint256 newScore);
}

/**
 * @title TreatySyndicate
 * @notice N-party treaty syndicates on X Layer — a mini agent-DAO.
 *
 * @dev Up to 10 AI agents pool escrow into a shared treaty. Every member's
 *      voting weight equals their stake share. Proposals (renegotiate charter,
 *      declare breach, settle & distribute) execute automatically once the
 *      required super-majority of weight votes in favor:
 *
 *        RENEGOTIATE / SETTLE : > 50% of total stake
 *        BREACH declaration   : ≥ 66% of total stake
 *
 *      A breach declaration slashes the target member's stake, distributes it
 *      to loyal members, and records a BREACHED outcome in the Syntheke
 *      ReputationOracle — so syndicate verdicts degrade portable reputation.
 */
contract TreatySyndicate {
    // ──── CONSTANTS ────────────────────────────────────────

    uint256 public constant MAX_MEMBERS = 10;
    uint256 public constant BREACH_QUORUM_BPS = 6600; // 66%
    uint256 public constant NORMAL_QUORUM_BPS = 5001; // >50%
    uint256 public constant PROPOSAL_DEADLINE = 7 days;

    // ──── TYPES ────────────────────────────────────────────

    struct Proposal {
        string kind; // "RENEGOTIATE" | "BREACH" | "SETTLE"
        address target; // member targeted by BREACH
        uint256[] payouts; // SETTLE: wei per member (order = members order)
        string newCharter; // RENEGOTIATE: replacement charter
        bytes32 payloadHash;
        address proposer;
        uint256 supportWeight;
        uint256 againstWeight;
        uint256 deadline;
        bool executed;
    }

    // ──── STORAGE ──────────────────────────────────────────

    address public owner;
    IReputationOracleV2 public reputationOracle;

    uint256 public syndicateCount;
    mapping(bytes32 => string) public syndicateNames;
    mapping(bytes32 => string) public syndicateCharters;
    mapping(bytes32 => address[]) public syndicateMembers;
    mapping(bytes32 => mapping(address => uint256)) public memberStakes;
    mapping(bytes32 => uint256) public totalStakes;
    mapping(bytes32 => bool) public dissolved;
    mapping(bytes32 => uint256) public proposalCounts;
    mapping(bytes32 => mapping(uint256 => Proposal)) public proposals;
    mapping(bytes32 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    // ──── EVENTS ────────────────────────────────────────────

    event SyndicateCreated(bytes32 indexed syndicateId, string name, uint256 memberCount, uint256 totalStake);
    event ProposalCreated(bytes32 indexed syndicateId, uint256 indexed proposalId, string kind, address proposer);
    event VoteCast(bytes32 indexed syndicateId, uint256 indexed proposalId, address voter, bool support, uint256 weight);
    event ProposalExecuted(bytes32 indexed syndicateId, uint256 indexed proposalId, string kind);
    event MemberSlashed(bytes32 indexed syndicateId, address indexed member, uint256 slashed);
    event CharterAmended(bytes32 indexed syndicateId, string newCharter);

    // ──── ERRORS ────────────────────────────────────────────

    error NotMember();
    error TooManyMembers();
    error InvalidStakes();
    error AlreadyVoted();
    error ProposalNotFound();
    error ProposalExpired();
    error InvalidPayouts();
    error AlreadyDissolved();

    // ──── MODIFIERS ─────────────────────────────────────────

    modifier onlyMember(bytes32 syndicateId) {
        if (memberStakes[syndicateId][msg.sender] == 0) revert NotMember();
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ──── CONSTRUCTOR ───────────────────────────────────────

    constructor(address _reputationOracle) {
        owner = msg.sender;
        reputationOracle = IReputationOracleV2(_reputationOracle);
    }

    function setReputationOracle(address _oracle) external onlyOwner {
        reputationOracle = IReputationOracleV2(_oracle);
    }

    // ──── CREATION ──────────────────────────────────────────

    /// @notice Form a syndicate. msg.value must equal the sum of member stakes.
    /// @param members Member addresses (2..10), distinct, no zero addresses.
    /// @param stakes Stake per member in wei — weights are derived from shares.
    function createSyndicate(
        string calldata name,
        string calldata charter,
        address[] calldata members,
        uint256[] calldata stakes
    ) external payable returns (bytes32 syndicateId) {
        if (members.length < 2 || members.length > MAX_MEMBERS) revert TooManyMembers();
        if (members.length != stakes.length) revert InvalidStakes();

        uint256 total = 0;
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == address(0) || stakes[i] == 0) revert InvalidStakes();
            for (uint256 j = i + 1; j < members.length; j++) {
                if (members[i] == members[j]) revert InvalidStakes();
            }
            total += stakes[i];
        }
        if (msg.value != total) revert InvalidStakes();

        syndicateId = keccak256(abi.encodePacked(name, msg.sender, block.timestamp, syndicateCount));
        syndicateCount++;
        syndicateNames[syndicateId] = name;
        syndicateCharters[syndicateId] = charter;
        syndicateMembers[syndicateId] = members;
        for (uint256 i = 0; i < members.length; i++) {
            memberStakes[syndicateId][members[i]] = stakes[i];
        }
        totalStakes[syndicateId] = total;

        emit SyndicateCreated(syndicateId, name, members.length, total);
    }

    // ──── PROPOSALS ─────────────────────────────────────────

    /// @notice Any member proposes a motion. Proposer's own weight auto-supports.
    function propose(
        bytes32 syndicateId,
        string calldata kind,
        address target,
        uint256[] calldata payouts,
        string calldata newCharter
    ) external onlyMember(syndicateId) returns (uint256 proposalId) {
        if (dissolved[syndicateId]) revert AlreadyDissolved();
        bool isBreach = keccak256(bytes(kind)) == keccak256(bytes("BREACH"));
        bool isSettle = keccak256(bytes(kind)) == keccak256(bytes("SETTLE"));
        bool isReneg = keccak256(bytes(kind)) == keccak256(bytes("RENEGOTIATE"));
        if (!isBreach && !isSettle && !isReneg) revert ProposalNotFound();

        // Validate at propose time so execution can never fail late
        if (isBreach && memberStakes[syndicateId][target] == 0) revert InvalidStakes();
        if (isSettle) {
            address[] memory members = syndicateMembers[syndicateId];
            if (payouts.length != members.length) revert InvalidPayouts();
            uint256 sum = 0;
            for (uint256 i = 0; i < payouts.length; i++) sum += payouts[i];
            if (sum != totalStakes[syndicateId]) revert InvalidPayouts();
        }

        proposalId = ++proposalCounts[syndicateId];
        Proposal storage p = proposals[syndicateId][proposalId];
        p.kind = kind;
        p.target = target;
        p.payouts = payouts;
        p.newCharter = newCharter;
        p.payloadHash = keccak256(abi.encode(kind, target, payouts, newCharter));
        p.proposer = msg.sender;
        p.deadline = block.timestamp + PROPOSAL_DEADLINE;
        // Proposer auto-supports with full weight
        p.supportWeight = memberStakes[syndicateId][msg.sender];
        hasVoted[syndicateId][proposalId][msg.sender] = true;

        emit ProposalCreated(syndicateId, proposalId, kind, msg.sender);
        emit VoteCast(syndicateId, proposalId, msg.sender, true, p.supportWeight);

        _tryExecute(syndicateId, proposalId);
    }

    function vote(bytes32 syndicateId, uint256 proposalId, bool support)
        external
        onlyMember(syndicateId)
    {
        Proposal storage p = proposals[syndicateId][proposalId];
        if (p.executed) revert ProposalNotFound();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > p.deadline) revert ProposalExpired();
        if (hasVoted[syndicateId][proposalId][msg.sender]) revert AlreadyVoted();

        uint256 weight = memberStakes[syndicateId][msg.sender];
        hasVoted[syndicateId][proposalId][msg.sender] = true;
        if (support) p.supportWeight += weight;
        else p.againstWeight += weight;

        emit VoteCast(syndicateId, proposalId, msg.sender, support, weight);

        _tryExecute(syndicateId, proposalId);
    }

    // ──── EXECUTION ─────────────────────────────────────────

    function _tryExecute(bytes32 syndicateId, uint256 proposalId) internal {
        Proposal storage p = proposals[syndicateId][proposalId];
        if (p.executed) return;
        uint256 total = totalStakes[syndicateId];
        if (total == 0) return;

        uint256 requiredBps = keccak256(bytes(p.kind)) == keccak256(bytes("BREACH"))
            ? BREACH_QUORUM_BPS
            : NORMAL_QUORUM_BPS;

        if (p.supportWeight * 10000 < requiredBps * total) return;

        p.executed = true;

        if (keccak256(bytes(p.kind)) == keccak256(bytes("RENEGOTIATE"))) {
            syndicateCharters[syndicateId] = p.newCharter;
            emit CharterAmended(syndicateId, p.newCharter);
        } else if (keccak256(bytes(p.kind)) == keccak256(bytes("BREACH"))) {
            _slashMember(syndicateId, p.target);
        } else {
            _settleAndDissolve(syndicateId, p.payouts);
        }

        emit ProposalExecuted(syndicateId, proposalId, p.kind);
    }

    function _slashMember(bytes32 syndicateId, address target) internal {
        uint256 slashed = memberStakes[syndicateId][target];
        memberStakes[syndicateId][target] = 0;

        // Distribute slashed stake to loyal members proportionally
        address[] memory members = syndicateMembers[syndicateId];
        uint256 loyalTotal = totalStakes[syndicateId] - slashed;
        for (uint256 i = 0; i < members.length; i++) {
            address m = members[i];
            if (m == target || memberStakes[syndicateId][m] == 0) continue;
            uint256 share = loyalTotal > 0 ? (slashed * memberStakes[syndicateId][m]) / loyalTotal : 0;
            memberStakes[syndicateId][m] += share;
        }

        // Portable reputation: the slashed member is marked BREACHED on-chain
        if (address(reputationOracle) != address(0)) {
            try reputationOracle.recordOutcome(syndicateId, target, "BREACHED", 0) returns (uint256) {
                // recorded
            } catch {
                // reputation recording is best-effort
            }
        }

        emit MemberSlashed(syndicateId, target, slashed);
    }

    function _settleAndDissolve(bytes32 syndicateId, uint256[] memory payouts) internal {
        address[] memory members = syndicateMembers[syndicateId];
        if (payouts.length != members.length) revert InvalidPayouts();
        uint256 sum = 0;
        for (uint256 i = 0; i < payouts.length; i++) sum += payouts[i];
        if (sum != totalStakes[syndicateId]) revert InvalidPayouts();

        dissolved[syndicateId] = true;
        for (uint256 i = 0; i < members.length; i++) {
            uint256 amt = payouts[i];
            memberStakes[syndicateId][members[i]] = 0;
            if (amt > 0) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool ok,) = members[i].call{ value: amt }("");
                require(ok, "Transfer failed");
            }
        }
    }

    // ──── VIEWS ─────────────────────────────────────────────

    function getSyndicate(bytes32 syndicateId)
        external
        view
        returns (string memory name, string memory charter, address[] memory members, uint256 totalStake, bool isDissolved)
    {
        return (
            syndicateNames[syndicateId],
            syndicateCharters[syndicateId],
            syndicateMembers[syndicateId],
            totalStakes[syndicateId],
            dissolved[syndicateId]
        );
    }

    function getMemberStake(bytes32 syndicateId, address member) external view returns (uint256) {
        return memberStakes[syndicateId][member];
    }

    function getProposal(bytes32 syndicateId, uint256 proposalId)
        external
        view
        returns (
            string memory kind,
            address target,
            uint256 supportWeight,
            uint256 againstWeight,
            uint256 deadline,
            bool executed,
            address proposer
        )
    {
        Proposal storage p = proposals[syndicateId][proposalId];
        return (p.kind, p.target, p.supportWeight, p.againstWeight, p.deadline, p.executed, p.proposer);
    }
}
