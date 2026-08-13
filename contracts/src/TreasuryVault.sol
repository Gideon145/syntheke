// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title TreasuryVault
 * @notice Protocol treasury for Syntheke. Collects a small creation fee
 *         (in native token) for every economic treaty formed by AI agents.
 *         All collections are verifiable on-chain via FeeCollected events.
 */
contract TreasuryVault {
    address public immutable owner;
    uint256 public feeAmount; // native token wei required per pact creation
    uint256 public totalFeesCollected;
    uint256 public feeCount;

    event FeeCollected(address indexed payer, bytes32 indexed pactId, uint256 amount);
    event FeeAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(uint256 _feeAmount) {
        owner = msg.sender;
        feeAmount = _feeAmount;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    /**
     * Pay the pact creation fee, tagging it with the pact ID.
     */
    function payCreationFee(bytes32 pactId) external payable {
        require(msg.value >= feeAmount, "insufficient fee");
        totalFeesCollected += msg.value;
        feeCount += 1;
        emit FeeCollected(msg.sender, pactId, msg.value);
    }

    function setFeeAmount(uint256 _feeAmount) external onlyOwner {
        emit FeeAmountUpdated(feeAmount, _feeAmount);
        feeAmount = _feeAmount;
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "insufficient balance");
        emit Withdrawn(to, amount);
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        totalFeesCollected += msg.value;
        feeCount += 1;
    }
}
