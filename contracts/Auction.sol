// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IAuction.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract Auction is 
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IAuction
{
    using SafeERC20 for IERC20;

    // 手续费配置常量
    uint256 public constant FEE_BASIS_POINTS = 250; // 2.5% 基础费率
    uint256 public constant MAX_FEE_BASIS_POINTS = 10000;

    // 动态手续费阈值（USD，18位小数）
    uint256 public constant LOW_TIER_THRESHOLD = 1000 * 1e18; // $1,000
    uint256 public constant MID_TIER_THRESHOLD = 10000 * 1e18; // $10,000
    uint256 public constant HIGH_TIER_THRESHOLD = 100000 * 1e18; // $100,000

    AuctionInfo public auctionInfo;

    // ETH价格预言机地址
    AggregatorV3Interface public ethPriceFeed;
    // 支持的ERC20代币价格预言机地址
    mapping(address => AggregatorV3Interface) public tokenPriceFeed;
    // 支持的代币列表
    mapping(address => bool) public supportedTokens;

    modifier onlyBeforeEnd() {
        require(block.timestamp < auctionInfo.endTime, "Auction: already ended");
        require(!auctionInfo.ended, "Auction: already ended");
        _;
    }

    modifier onlyAfterEnd() {
        require(block.timestamp >= auctionInfo.endTime || auctionInfo.ended, "Auction: not ended yet");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _seller,
        address _nftAddress,
        uint256 _tokenId,
        uint256 _startingPriceUSD,
        uint256 _duration
    ) external initializer {
        __Ownable_init(_seller);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        ethPriceFeed = AggregatorV3Interface(0x694AA1769357215DE4FAC081bf1f309aDC325306);
        __setupSupportedToken();

        require(_seller != address(0), "Auction: invalid seller address");
        require(_nftAddress != address(0), "Auction: invalid NFT address");
        require(_startingPriceUSD > 0, "Auction: starting price must be greater than zero");
        require(_duration > 0, "Auction: Invalid duration");

        IERC721(_nftAddress).transferFrom(_seller, address(this), _tokenId);

        auctionInfo = AuctionInfo({
            seller: _seller,
            nftAddress: _nftAddress,
            tokenId: _tokenId,
            startingPriceUSD: _startingPriceUSD,
            currentBidUSD: 0,
            currentBidder: address(0),
            currentBidAmount: 0,
            paymentToken: address(0),
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            ended: false,
            nftClaimed: false,
            paymentClaimed: false
        });

        emit AuctionCreated(_seller, _nftAddress, _tokenId, _startingPriceUSD, auctionInfo.endTime);
    }

    function __setupSupportedToken() internal {
        address usdc = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
        tokenPriceFeed[usdc] = AggregatorV3Interface(0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E);
        supportedTokens[usdc] = true;
    }

    function bidWithETH() external payable nonReentrant onlyBeforeEnd {
        _bidWithETH();
    }

    function bidWithToken(address paymentToken, uint256 amount) external nonReentrant onlyBeforeEnd {
        require(paymentToken != address(0), "Auction: invalid payment token address");
        require(amount > 0, "Auction: bid amount must be greater than zero");
        require(supportedTokens[paymentToken], "Auction: unsupported payment token");

        uint256 bidUSD = getCurrentPriceUSD(paymentToken, amount);
        require(bidUSD >= auctionInfo.startingPriceUSD, "Auction: bid must be at least starting price");
        require(bidUSD > auctionInfo.currentBidUSD, "Auction: bid must be higher than current bid");

        IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), amount);

        _refundPreviousBidder();

        auctionInfo.currentBidUSD = bidUSD;
        auctionInfo.currentBidder = msg.sender;
        auctionInfo.currentBidAmount = amount;
        auctionInfo.paymentToken = paymentToken;

        emit BidPlaced(msg.sender, bidUSD, paymentToken, amount);
    }

    function endAuction() external onlyAfterEnd {
        require(!auctionInfo.ended, "Auction: already ended");
        auctionInfo.ended = true;

        emit AuctionEnded(
            auctionInfo.currentBidder,
            auctionInfo.currentBidUSD,
            auctionInfo.paymentToken,
            auctionInfo.currentBidAmount
        );

        if (auctionInfo.currentBidder != address(0)) {
            if (msg.sender == auctionInfo.currentBidder && !auctionInfo.nftClaimed) {
                _claimNFT();
            } else if (msg.sender == auctionInfo.seller && !auctionInfo.paymentClaimed) {
                _claimPayment();
            }
        } else {
            if (msg.sender == auctionInfo.seller && !auctionInfo.nftClaimed) {
                _claimNFTToSeller();
            }
        }
    }

    function claimNFT() external nonReentrant {
        require(auctionInfo.ended, "Auction: auction not ended");
        require(auctionInfo.currentBidder != address(0), "Auction: no winner");
        require(!auctionInfo.nftClaimed, "Auction: NFT already claimed");

        _claimNFT();
    }

    function claimPayment() external nonReentrant {
        require(auctionInfo.ended, "Auction: auction not ended");
        require(auctionInfo.currentBidder != address(0), "Auction: no winner");
        require(!auctionInfo.paymentClaimed, "Auction: payment already claimed");
        require(msg.sender == auctionInfo.seller, "Auction: only seller can claim payment");

        _claimPayment();
    }

    function getAuctionInfo() external view returns (AuctionInfo memory) {
        return auctionInfo;
    }

    function getCurrentPriceUSD(address paymentToken, uint256 amount) public view returns (uint256) {
        if (paymentToken == address(0)) {
            return _getETHPriceUSD(amount);
        }
        return _getTokenPriceUSD(paymentToken, amount);
    }

    function _bidWithETH() internal {
        require(msg.value > 0, "Auction: bid amount must be greater than zero");

        uint256 bidUSD = getCurrentPriceUSD(address(0), msg.value);
        require(bidUSD >= auctionInfo.startingPriceUSD, "Auction: bid must be at least starting price");
        require(bidUSD > auctionInfo.currentBidUSD, "Auction: bid must be higher than current bid");

        _refundPreviousBidder();

        auctionInfo.currentBidUSD = bidUSD;
        auctionInfo.currentBidder = msg.sender;
        auctionInfo.currentBidAmount = msg.value;
        auctionInfo.paymentToken = address(0);

        emit BidPlaced(msg.sender, bidUSD, address(0), msg.value);
    }

    function _refundPreviousBidder() internal {
        if (auctionInfo.currentBidder != address(0)) {
            if (auctionInfo.paymentToken == address(0)) {
                payable(auctionInfo.currentBidder).transfer(auctionInfo.currentBidAmount);
            } else {
                IERC20(auctionInfo.paymentToken).safeTransfer(auctionInfo.currentBidder, auctionInfo.currentBidAmount);
            }
        }
    }

    function _getETHPriceUSD(uint256 ethAmount) internal view returns (uint256) {
        (, int256 price, , , ) = ethPriceFeed.latestRoundData();
        require(price > 0, "Auction: invalid ETH price");

        uint8 decimals = ethPriceFeed.decimals();
        uint256 ethPriceUSD = uint256(price) * (10 ** (18 - decimals));
        return (ethAmount * ethPriceUSD) / 1e18;
    }

    function _getTokenPriceUSD(address token, uint256 tokenAmount) internal view returns (uint256) {
        require(supportedTokens[token], "Auction: unsupported payment token");
        require(tokenAmount > 0, "Auction: token amount must be greater than zero");

        AggregatorV3Interface priceFeed = tokenPriceFeed[token];
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Auction: invalid token price");

        uint8 decimals = priceFeed.decimals();
        uint8 tokenDecimals = IERC20Metadata(token).decimals();

        uint256 tokenPriceUSD = uint256(price) * (10 ** (18 - decimals));
        uint256 normalizedAmount = tokenAmount;
        if (tokenDecimals < 18) {
            normalizedAmount = tokenAmount * (10 ** (18 - tokenDecimals));
        } else if (tokenDecimals > 18) {
            normalizedAmount = tokenAmount / (10 ** (tokenDecimals - 18));
        }
        return (normalizedAmount * tokenPriceUSD) / 1e18;
    }

    function _transferNFT(address to) internal {
        require(!auctionInfo.nftClaimed, "Auction: NFT already claimed");
        auctionInfo.nftClaimed = true;
        IERC721(auctionInfo.nftAddress).transferFrom(address(this), to, auctionInfo.tokenId);
        emit NFTClaimed(to, auctionInfo.tokenId);
    }

    function _claimNFT() internal {
        _transferNFT(auctionInfo.currentBidder);
    }

    function _claimNFTToSeller() internal {
        _transferNFT(auctionInfo.seller);
    }

    function _claimPayment() internal {
        auctionInfo.paymentClaimed = true;

        uint256 fee = _calculateFee(auctionInfo.currentBidUSD, auctionInfo.currentBidAmount);
        uint256 sellerAmount = auctionInfo.currentBidAmount - fee;

        if (auctionInfo.paymentToken == address(0)) {
            payable(auctionInfo.seller).transfer(sellerAmount);
            if (fee > 0) {
                payable(owner()).transfer(fee);
            }
        } else {
            IERC20(auctionInfo.paymentToken).safeTransfer(auctionInfo.seller, sellerAmount);
            if (fee > 0) {
                IERC20(auctionInfo.paymentToken).safeTransfer(owner(), fee);
            }
        }

        emit PaymentClaimed(auctionInfo.seller, sellerAmount, fee);
    }

    function _calculateFee(uint256 bidUSD, uint256 bidAmount) internal pure returns (uint256) {
        uint256 feeBasisPoints = FEE_BASIS_POINTS;

        if (bidUSD >= HIGH_TIER_THRESHOLD) {
            feeBasisPoints = 100; // 1.0%
        } else if (bidUSD >= MID_TIER_THRESHOLD) {
            feeBasisPoints = 150; // 1.5%
        } else if (bidUSD >= LOW_TIER_THRESHOLD) {
            feeBasisPoints = 200; // 2.0%
        }

        return (bidAmount * feeBasisPoints) / MAX_FEE_BASIS_POINTS;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    receive() external payable {
        if (msg.value > 0 && !auctionInfo.ended && block.timestamp < auctionInfo.endTime) {
            _bidWithETH();
        } 
    }
}