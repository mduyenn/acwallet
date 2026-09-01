// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract YieldVault {
    address public owner;
    string public strategyId;
    mapping(address => uint256) public deposits;
    uint256 public totalDeposited;

    event Deposited(address indexed user, uint256 amount, uint256 timestamp);
    event Withdrawn(address indexed user, uint256 amount);

    constructor(string memory _strategyId) {
        owner = msg.sender;
        strategyId = _strategyId;
    }

    function deposit() public payable {
        deposits[msg.sender] += msg.value;
        totalDeposited += msg.value;
        emit Deposited(msg.sender, msg.value, block.timestamp);
    }

    receive() external payable {
        deposit();
    }

    function withdraw(uint256 amount) external {
        require(deposits[msg.sender] >= amount, "insufficient");
        deposits[msg.sender] -= amount;
        totalDeposited -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw failed");
        emit Withdrawn(msg.sender, amount);
    }
}
