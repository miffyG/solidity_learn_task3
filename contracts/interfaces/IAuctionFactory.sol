// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.20;

interface IAuctionFactory {

    event AuctionDeployed(
        address indexed seller,
        address indexed auctionContract,
        uint256 version
    );

    event AuctionImplementationUpgraded(
        uint256 indexed version,
        address indexed oldImplementation,
        address indexed newImplementation
    );


    function createAuction(
        address _seller,
        address _nftAddress,
        uint256 _tokenId,
        uint256 _startingPriceUSD,
        uint256 _duration
    ) external returns (address);

    function upgradeAuctionImplementation(address newImplementation) external;

    function getAuctions() external view returns (address[] memory);
}