// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.20;

interface IAuction {
    struct AuctionInfo {
        address seller;
        address nftAddress;
        uint256 tokenId;
        uint256 startingPriceUSD;
        uint256 currentBidUSD;
        address currentBidder;
        uint256 currentBidAmount;
        address paymentToken;
        uint256 startTime;
        uint256 endTime;
        bool ended;
        bool nftClaimed;
        bool paymentClaimed;
    }

    // Emitted when a new auction is created
    event AuctionCreated(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 startingPriceUSD,
        uint256 endTime
    );

    // Emitted when a bid is placed
    event BidPlaced(
        address indexed bidder,
        uint256 bidAmountUSD,
        address paymentToken,
        uint256 paymentAmount
    );

    // Emitted when an auction is ended
    event AuctionEnded(
        address indexed winner,
        uint256 finalBidUSD,
        address paymentToken,
        uint256 paymentAmount
    );

    // Emitted when the NFT is claimed by the winner
    event NFTClaimed(
        address indexed winner,
        uint256 tokenId
    );
    
    // Emitted when the payment is claimed by the seller
    event PaymentClaimed(
        address indexed seller,
        uint256 amount,
        uint256 fee
    );

    // Initialize the auction with necessary parameters
    function initialize(
        address _seller,
        address _nftAddress,
        uint256 _tokenId,
        uint256 _startingPriceUSD,
        uint256 _duration,
        address _ethPriceFeed
    ) external;

    function bidWithETH() external payable;
    function bidWithToken(address paymentToken, uint256 amount) external;
    function endAuction() external;
    function claimNFT() external;
    function claimPayment() external;
    function getAuctionInfo() external view returns (AuctionInfo memory);
    function getCurrentPriceUSD(address paymentToken, uint256 amount) external view returns (uint256);
}