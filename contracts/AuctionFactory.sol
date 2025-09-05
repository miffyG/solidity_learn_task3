// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAuctionFactory.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/IAuction.sol";

contract AuctionFactory is IAuctionFactory, Ownable {
    using Clones for address;

    uint256 public currentVersion;

    mapping(uint256 => address) public auctionImplementations; // 版本号到实现合约地址的映射
    mapping(address => uint256) public auctionVersions; // 拍卖地址到版本号的映射

    
    mapping(address => address) public auctions; // 卖家地址到其拍卖合约的映射
    mapping(address => mapping(uint256 => address)) public nftToAuction; // NFT合约地址和Token ID到拍卖合约地址的映射
    address[] public allAuctions; // 所有拍卖合约地址列表

    constructor(address _auctionImplementation, address _owner) Ownable(_owner) {
        require(_auctionImplementation != address(0), "AuctionFactory: invalid implementation address");
        currentVersion = 1;
        auctionImplementations[currentVersion] = _auctionImplementation;
    }

    function createAuction(
        address _seller,
        address _nftAddress,
        uint256 _tokenId,
        uint256 _startingPriceUSD,
        uint256 _duration
    ) external returns (address) {
        require(_seller != address(0), "AuctionFactory: invalid seller address");
        require(_nftAddress != address(0), "AuctionFactory: invalid NFT address");
        require(_startingPriceUSD > 0, "AuctionFactory: starting price must be greater than zero");
        require(_duration > 0, "AuctionFactory: invalid duration");
        require(auctions[_seller] == address(0), "AuctionFactory: seller already has an active auction");
        require(nftToAuction[_nftAddress][_tokenId] == address(0), "AuctionFactory: NFT is already in an active auction");

        address implementation = auctionImplementations[currentVersion];
        require(implementation != address(0), "AuctionFactory: no implementation for current version");

        // todo: 验证调用者拥有该NFT或已授权

        address auction = _deployAuction();
        IAuction(auction).initialize(_seller, _nftAddress, _tokenId, _startingPriceUSD, _duration);

        auctions[_seller] = auction;
        nftToAuction[_nftAddress][_tokenId] = auction;
        auctionVersions[auction] = currentVersion;
        allAuctions.push(auction);

        emit AuctionDeployed(_seller, auction, currentVersion);
        return auction;
    }

    function upgradeAuctionImplementation(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), "AuctionFactory: invalid implementation address");
        require(newImplementation != auctionImplementations[currentVersion], "AuctionFactory: implementation is already current");
        address oldImplementation = auctionImplementations[currentVersion];
        currentVersion++;
        auctionImplementations[currentVersion] = newImplementation;
        emit AuctionImplementationUpgraded(currentVersion, oldImplementation, newImplementation);
    }

    function getAuctions() external view returns (address[] memory) {
        return allAuctions;
    }

    function _deployAuction() internal returns (address) {
        return auctionImplementations[currentVersion].clone();
    }
}