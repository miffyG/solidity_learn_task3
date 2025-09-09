// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.20;

interface IAuctionFactory {

    event AuctionDeployed(
        address indexed seller,
        address indexed auctionContract
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
        uint256 _duration,
        address _ethPriceFeed
    ) external returns (address);

    function getAuctions() external view returns (address[] memory);

    function getAuction(address nftAddress, uint256 tokenId) external view returns (address);

    function upgradeImplementation(address newImplementation) external;
}