// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BillReceiver {
    address public owner;
    string public billId;

    event BillPaid(address indexed payer, uint256 amount, uint256 timestamp);

    constructor(string memory _billId) {
        owner = msg.sender;
        billId = _billId;
    }

    receive() external payable {
        emit BillPaid(msg.sender, msg.value, block.timestamp);
    }

    function withdraw() external {
        require(msg.sender == owner, "not owner");
        (bool ok, ) = payable(owner).call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }
}
