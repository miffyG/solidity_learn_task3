// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "./Auction.sol";

contract AuctionV2 is Auction {
    function version() external pure returns (string memory) {
        return "v2.0.0";
    }
}