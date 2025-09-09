// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./interfaces/IAuctionFactory.sol";
import "./Auction.sol";
import "./interfaces/IAuction.sol";

contract AuctionFactory is IAuctionFactory, Ownable {
    address public auctionImplementation;
    uint256 public implementationVersion;

    // NFT合约地址 + TokenId => 拍卖合约地址
    mapping(address => mapping(uint256 => address)) public getAuction;
    address[] public allAuctions;

    constructor(address _owner) Ownable(_owner) {
        // 部署初始实现合约
        auctionImplementation = address(new Auction());
        implementationVersion = 1;
    }

    function createAuction(
        address _seller,
        address _nftAddress,
        uint256 _tokenId,
        uint256 _startingPriceUSD,
        uint256 _duration,
        address _ethPriceFeed
    ) external returns (address auctionProxy) {
        require(_seller != address(0), "AuctionFactory: invalid seller address");
        require(_nftAddress != address(0), "AuctionFactory: invalid NFT address");
        require(_startingPriceUSD > 0, "AuctionFactory: starting price must be greater than zero");
        require(_duration > 0, "AuctionFactory: invalid duration");
        require(getAuction[_nftAddress][_tokenId] == address(0), "AuctionFactory: auction already exists");

        // 首先转移NFT到工厂合约
        IERC721(_nftAddress).transferFrom(_seller, address(this), _tokenId);

        // 创建代理合约
        bytes memory initData = abi.encodeWithSelector(
            IAuction.initialize.selector,
            _seller,
            _nftAddress,
            _tokenId,
            _startingPriceUSD,
            _duration,
            _ethPriceFeed
        );

        auctionProxy = address(new ERC1967Proxy(auctionImplementation, initData));

        // 将NFT转移到拍卖合约
        IERC721(_nftAddress).transferFrom(address(this), auctionProxy, _tokenId);

        // 记录拍卖合约
        getAuction[_nftAddress][_tokenId] = auctionProxy;
        allAuctions.push(auctionProxy);

        emit AuctionDeployed(_seller, auctionProxy);
    }

    function getAuctions() external view returns (address[] memory) {
        return allAuctions;
    }

    function upgradeImplementation(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), "AuctionFactory: invalid implementation");
        
        address oldImplementation = auctionImplementation;
        auctionImplementation = newImplementation;
        implementationVersion++;

        emit AuctionImplementationUpgraded(implementationVersion, oldImplementation, newImplementation);
    }
}