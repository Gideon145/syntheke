// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title ArtifactRegistry
 * @notice On-chain registry of AI-produced artifacts (Batch 3, Feature 7).
 *
 * Every piece of AI output the protocol produces — negotiation moves,
 * plain-English contracts, mediation reasoning — is hashed and recorded
 * here. The dashboard then verifies what it renders against what is on
 * chain: if the hash matches, the artifact is provably the one produced
 * at that moment. Tamper-evident AI provenance.
 */
contract ArtifactRegistry {
    address public immutable owner;

    struct Artifact {
        bytes32 hash;
        string kind;
        string producer;
        uint256 version;
        uint256 timestamp;
    }

    mapping(bytes32 => Artifact[]) public artifacts; // pactId => artifacts
    mapping(bytes32 => uint256) public artifactCount;

    event ArtifactRecorded(
        bytes32 indexed pactId,
        string indexed kind,
        bytes32 hash,
        string producer,
        uint256 version,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function recordArtifact(
        bytes32 pactId,
        string calldata kind,
        bytes32 hash,
        string calldata producer,
        uint256 version
    ) external onlyOwner {
        artifacts[pactId].push(Artifact({
            hash: hash,
            kind: kind,
            producer: producer,
            version: version,
            timestamp: block.timestamp
        }));
        artifactCount[pactId]++;
        emit ArtifactRecorded(pactId, kind, hash, producer, version, block.timestamp);
    }

    function getArtifacts(bytes32 pactId) external view returns (Artifact[] memory) {
        return artifacts[pactId];
    }

    function getArtifactCount(bytes32 pactId) external view returns (uint256) {
        return artifactCount[pactId];
    }

    /**
     * Verify that an artifact hash exists on-chain for a pact.
     * Returns (found, version) — version 0 means not found.
     */
    function verifyArtifact(bytes32 pactId, bytes32 hash) external view returns (bool found, uint256 version) {
        Artifact[] storage list = artifacts[pactId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i].hash == hash) return (true, list[i].version);
        }
        return (false, 0);
    }
}
