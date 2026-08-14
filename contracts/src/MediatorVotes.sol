// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MediatorVotes
 * @notice On-chain commit-reveal voting for Syntheke's AI mediator swarm.
 *
 * Why commit-reveal: without it, mediators could copy each other's verdicts
 * (last-mover advantage) or vote strategically after seeing the majority.
 * With commitments, every mediator's verdict is bound to a hash BEFORE any
 * verdict is visible — then revealed and verified on-chain. Anyone can check
 * that no mediator changed their mind after seeing the others.
 *
 * Flow per pact:
 *   1. Each mediator calls commitVote(pactId, commitment) — commitment =
 *      keccak256(abi.encodePacked(verdict, fairnessScore, reasonHash, nonce))
 *   2. Once ALL registered mediators have committed, revealVote() is unlocked
 *   3. revealVote verifies hash == commitment and stores the revealed verdict
 *   4. Anyone can read getVotes(pactId) — fully verifiable on-chain
 */
contract MediatorVotes {
    address public immutable owner;

    address[] public mediators;
    mapping(address => bool) public isMediator;

    struct Commitment {
        bytes32 hash;
        bool committed;
    }

    struct RevealedVote {
        address mediator;
        string verdict;        // "approve" | "reject" | "abstain"
        uint256 fairnessScore; // 0-100
        bytes32 reasonHash;    // keccak256 of the AI reasoning text
        bool revealed;
    }

    mapping(bytes32 => mapping(address => Commitment)) public commitments; // pactId => mediator => commitment
    mapping(bytes32 => uint256) public commitCount;
    mapping(bytes32 => RevealedVote[]) public votes; // pactId => revealed votes
    mapping(bytes32 => uint256) public verdictCount;

    event MediatorRegistered(address indexed mediator);
    event VoteCommitted(bytes32 indexed pactId, address indexed mediator, bytes32 commitment);
    event VoteRevealed(bytes32 indexed pactId, address indexed mediator, string verdict, uint256 fairnessScore);
    event RoundComplete(bytes32 indexed pactId, uint256 voteCount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyMediator() {
        require(isMediator[msg.sender], "not mediator");
        _;
    }

    constructor(address[] memory _mediators) {
        owner = msg.sender;
        for (uint256 i = 0; i < _mediators.length; i++) {
            require(!isMediator[_mediators[i]], "duplicate mediator");
            isMediator[_mediators[i]] = true;
            mediators.push(_mediators[i]);
            emit MediatorRegistered(_mediators[i]);
        }
    }

    function registerMediator(address m) external onlyOwner {
        require(!isMediator[m], "already registered");
        isMediator[m] = true;
        mediators.push(m);
        emit MediatorRegistered(m);
    }

    function mediatorCount() external view returns (uint256) {
        return mediators.length;
    }

    function commitVote(bytes32 pactId, bytes32 commitment) external onlyMediator {
        require(!commitments[pactId][msg.sender].committed, "already committed");
        require(votes[pactId].length == 0, "round already revealed");
        commitments[pactId][msg.sender] = Commitment({ hash: commitment, committed: true });
        commitCount[pactId]++;
        emit VoteCommitted(pactId, msg.sender, commitment);
    }

    /**
     * Reveal a previously committed vote. Only unlockable once every
     * registered mediator has committed — guarantees no reveal happens
     * before all verdicts are bound.
     */
    function revealVote(
        bytes32 pactId,
        string calldata verdict,
        uint256 fairnessScore,
        bytes32 reasonHash,
        bytes32 nonce
    ) external onlyMediator {
        Commitment storage c = commitments[pactId][msg.sender];
        require(c.committed, "not committed");
        require(commitCount[pactId] >= mediators.length, "not all committed");
        require(fairnessScore <= 100, "score out of range");
        require(!hasRevealed(pactId, msg.sender), "already revealed");

        bytes32 expected = keccak256(abi.encodePacked(verdict, fairnessScore, reasonHash, nonce));
        require(c.hash == expected, "commitment mismatch");

        votes[pactId].push(RevealedVote({
            mediator: msg.sender,
            verdict: verdict,
            fairnessScore: fairnessScore,
            reasonHash: reasonHash,
            revealed: true
        }));
        emit VoteRevealed(pactId, msg.sender, verdict, fairnessScore);

        if (votes[pactId].length == mediators.length) {
            verdictCount[pactId]++;
            emit RoundComplete(pactId, votes[pactId].length);
        }
    }

    function hasRevealed(bytes32 pactId, address mediator) public view returns (bool) {
        RevealedVote[] storage vs = votes[pactId];
        for (uint256 i = 0; i < vs.length; i++) {
            if (vs[i].mediator == mediator) return true;
        }
        return false;
    }

    function getVotes(bytes32 pactId) external view returns (RevealedVote[] memory) {
        return votes[pactId];
    }

    function getCommitment(bytes32 pactId, address mediator) external view returns (bytes32, bool) {
        Commitment storage c = commitments[pactId][mediator];
        return (c.hash, c.committed);
    }

    function tally(bytes32 pactId) external view returns (uint256 approveCount, uint256 rejectCount, uint256 abstainCount) {
        RevealedVote[] storage vs = votes[pactId];
        for (uint256 i = 0; i < vs.length; i++) {
            bytes32 v = keccak256(bytes(vs[i].verdict));
            if (v == keccak256("approve")) approveCount++;
            else if (v == keccak256("reject")) rejectCount++;
            else abstainCount++;
        }
    }
}
