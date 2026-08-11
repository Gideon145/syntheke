// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title AgentRegistry
 * @notice On-chain registry of AI agent identities, capabilities, and active status.
 * @dev Integrates with ERC-8004 for agent identity verification.
 *      Agents register their ERC-8004 token, declare capabilities, and maintain active status.
 */
contract AgentRegistry {
    // ──── TYPES ────────────────────────────────────────────

    struct AgentRecord {
        address agentAddress;
        uint256 erc8004TokenId;
        bytes32[] capabilityHashes;
        bool active;
        uint256 registeredAt;
        uint256 lastActive;
        string metadataURI;
    }

    // ──── STORAGE ──────────────────────────────────────────

    /// @notice ERC-8004 contract address (verified on X Layer)
    address public erc8004Contract;

    mapping(address => AgentRecord) public agents;
    mapping(uint256 => address) public tokenToAgent;
    address[] public agentList;

    uint256 public agentCount;

    // ──── EVENTS ───────────────────────────────────────────

    event AgentRegistered(address indexed agent, uint256 indexed tokenId, bytes32[] capabilities);
    event CapabilitiesUpdated(address indexed agent, bytes32[] newCapabilities);
    event AgentSuspended(address indexed agent);
    event AgentReactivated(address indexed agent);

    // ──── ERRORS ───────────────────────────────────────────

    error AlreadyRegistered();
    error NotRegistered();
    error NotTokenOwner();
    error AgentSuspendedError();
    error InvalidERC8004();

    // ──── CONSTRUCTOR ──────────────────────────────────────

    constructor(address _erc8004Contract) {
        erc8004Contract = _erc8004Contract;
    }

    // ──── REGISTRATION ─────────────────────────────────────

    /// @notice Register an agent with its ERC-8004 token and capabilities.
    function registerAgent(uint256 erc8004TokenId, bytes32[] calldata capabilities, string calldata metadataURI)
        external
    {
        if (agents[msg.sender].registeredAt != 0) revert AlreadyRegistered();

        // Verify ERC-8004 token ownership (simplified — production uses IERC721 ownerOf)
        // IERC8004(erc8004Contract).requireOwnership(msg.sender, erc8004TokenId);

        agents[msg.sender] = AgentRecord({
            agentAddress: msg.sender,
            erc8004TokenId: erc8004TokenId,
            capabilityHashes: capabilities,
            active: true,
            registeredAt: block.timestamp,
            lastActive: block.timestamp,
            metadataURI: metadataURI
        });
        tokenToAgent[erc8004TokenId] = msg.sender;
        agentList.push(msg.sender);
        agentCount++;

        emit AgentRegistered(msg.sender, erc8004TokenId, capabilities);
    }

    // ──── CAPABILITIES ─────────────────────────────────────

    /// @notice Update declared capabilities.
    function updateCapabilities(bytes32[] calldata newCapabilities) external {
        AgentRecord storage agent = agents[msg.sender];
        if (agent.registeredAt == 0) revert NotRegistered();
        if (!agent.active) revert AgentSuspendedError();

        agent.capabilityHashes = newCapabilities;
        agent.lastActive = block.timestamp;
        emit CapabilitiesUpdated(msg.sender, newCapabilities);
    }

    // ──── LIFECYCLE ────────────────────────────────────────

    /// @notice Suspend an agent — prevents new pact participation.
    function suspendAgent(address agent) external {
        require(msg.sender == agent || msg.sender == _getOwner(), "Unauthorized");
        AgentRecord storage record = agents[agent];
        if (record.registeredAt == 0) revert NotRegistered();
        record.active = false;
        emit AgentSuspended(agent);
    }

    /// @notice Reactivate a suspended agent.
    function reactivateAgent() external {
        AgentRecord storage agent = agents[msg.sender];
        if (agent.registeredAt == 0) revert NotRegistered();
        agent.active = true;
        agent.lastActive = block.timestamp;
        emit AgentReactivated(msg.sender);
    }

    /// @notice Record agent activity (called by SynthekeContract).
    function recordActivity(address agent) external {
        AgentRecord storage record = agents[agent];
        if (record.registeredAt != 0) {
            record.lastActive = block.timestamp;
        }
    }

    // ──── VIEWS ────────────────────────────────────────────

    function getAgent(address agent) external view returns (AgentRecord memory) {
        return agents[agent];
    }

    function isAgentActive(address agent) external view returns (bool) {
        return agents[agent].active;
    }

    function getAgentCapabilities(address agent) external view returns (bytes32[] memory) {
        return agents[agent].capabilityHashes;
    }

    function getAgentCount() external view returns (uint256) {
        return agentCount;
    }

    function getAllAgents() external view returns (address[] memory) {
        return agentList;
    }

    function getAgentByToken(uint256 tokenId) external view returns (address) {
        return tokenToAgent[tokenId];
    }

    // ──── INTERNAL ─────────────────────────────────────────

    function _getOwner() internal view returns (address) {
        return address(0); // Placeholder — use Ownable in production
    }
}
