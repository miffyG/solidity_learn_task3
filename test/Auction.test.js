const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Auction", function () {
    let auction;
    let mockNFT;
    let mockERC20;
    let mockPriceFeed;
    let owner, seller, bidder1, bidder2, bidder3;

    const STARTING_PRICE_USD = ethers.parseUnits("1000", 18);
    const DURATION = 7 * 24 * 60 * 60; // 7 days
    const TOKEN_ID = 1;

    const ETH_PRICE = 2000 * 10 ** 8; // $2000 in 8 decimals
    const USDC_PRICE = 1 * 10 ** 8; // $1 in 8 decimals

    beforeEach(async function () {
        this.timeout(80000);
        [owner, seller, bidder1, bidder2, bidder3] = await ethers.getSigners();

        // 部署mock合约
        const MockERC721 = await ethers.getContractFactory("MockERC721");
        mockNFT = await MockERC721.deploy();
        await mockNFT.waitForDeployment();
        await mockNFT.mint(seller.address, TOKEN_ID);

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockERC20 = await MockERC20.deploy("USDC", "USDC", 6);
        await mockERC20.waitForDeployment();

        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = await MockPriceFeed.deploy(8, ETH_PRICE);
        await mockPriceFeed.waitForDeployment();

        // 先部署 Auction 代理合约
        const Auction = await ethers.getContractFactory("Auction");
        const auctionProxy = await upgrades.deployProxy(Auction, [], { initializer: false });
        await auctionProxy.waitForDeployment();

        // 初始化 Auction 合约
        auction = auctionProxy.attach(auctionProxy.target);
        await auction.initialize(
            seller.address,
            mockNFT.target,
            TOKEN_ID,
            STARTING_PRICE_USD,
            DURATION,
            mockPriceFeed.target
        );

        // 手动转移NFT到拍卖合约（模拟AuctionFactory的行为）
        await mockNFT.connect(seller).transferFrom(seller.address, auction.target, TOKEN_ID);
    });

    describe("Initialization", function () {

        it("Should initialize auction correctly", async function () {
            const info = await auction.getAuctionInfo();

            expect(info.seller).to.equal(seller.address);
            expect(info.nftAddress).to.equal(mockNFT.target);
            expect(info.tokenId).to.equal(TOKEN_ID);
            expect(info.startingPriceUSD).to.equal(STARTING_PRICE_USD);
            expect(info.currentBidUSD).to.equal(0);
            expect(info.currentBidder).to.equal(ethers.ZeroAddress);
            expect(info.ended).to.be.false;
            expect(info.nftClaimed).to.be.false;
            expect(info.paymentClaimed).to.be.false;
        });

        it("Should revert with invalid parameters", async function () {
            const Auction = await ethers.getContractFactory("Auction");

            const newAuction1 = await upgrades.deployProxy(Auction, [], { initializer: false });
            await expect(
                newAuction1.initialize(
                    ethers.ZeroAddress,
                    mockNFT.target,
                    TOKEN_ID,
                    STARTING_PRICE_USD,
                    DURATION,
                    mockPriceFeed.target
                )
            ).to.be.reverted;

            const newAuction2 = await upgrades.deployProxy(Auction, [], { initializer: false });
            await expect(
                newAuction2.initialize(
                    seller.address,
                    ethers.ZeroAddress,
                    TOKEN_ID,
                    STARTING_PRICE_USD,
                    DURATION,
                    mockPriceFeed.target
                )
            ).to.be.revertedWith("Auction: invalid NFT address");

            const newAuction3 = await upgrades.deployProxy(Auction, [], { initializer: false });
            await expect(
                newAuction3.initialize(
                    seller.address,
                    mockNFT.target,
                    TOKEN_ID,
                    0,
                    DURATION,
                    mockPriceFeed.target
                )
            ).to.be.revertedWith("Auction: starting price must be greater than zero");

            const newAuction4 = await upgrades.deployProxy(Auction, [], { initializer: false });
            await expect(
                newAuction4.initialize(
                    seller.address,
                    mockNFT.target,
                    TOKEN_ID,
                    STARTING_PRICE_USD,
                    0,
                    mockPriceFeed.target
                )
            ).to.be.revertedWith("Auction: Invalid duration");
        });

        it("Should emit AuctionCreated event", async function () {
            const Auction = await ethers.getContractFactory("Auction");
            await mockNFT.mint(seller.address, 2);
            await mockNFT.connect(seller).approve(seller.address, 2);

            const newAuctionProxy = await upgrades.deployProxy(Auction, [], { initializer: false });
            const newAuctionAddress = newAuctionProxy.target;
            await mockNFT.connect(seller).approve(newAuctionAddress, 2);
            const deployTx = await newAuctionProxy.initialize(
                seller.address,
                mockNFT.target,
                2,
                STARTING_PRICE_USD,
                DURATION,
                mockPriceFeed.target
            );
            const receipt = await deployTx.wait();

            await expect(deployTx)
                .to.emit(newAuctionProxy.attach(newAuctionAddress), "AuctionCreated")
                .withArgs(seller.address, mockNFT.target, 2, STARTING_PRICE_USD, anyValue);
        });
    });

    describe("Bidding with ETH", function () {
        const bidAmount = ethers.parseEther("1"); // 1 ETH

        it("Should allow bidding with ETH", async function () {
            await expect(auction.connect(bidder1).bidWithETH({ value: bidAmount }))
                .to.emit(auction, "BidPlaced")
                .withArgs(bidder1.address, anyValue, ethers.ZeroAddress, bidAmount);

            const info = await auction.getAuctionInfo();
            expect(info.currentBidder).to.equal(bidder1.address);
            expect(info.currentBidAmount).to.equal(bidAmount);
            expect(info.paymentToken).to.equal(ethers.ZeroAddress);
        });

        it("Should allow bidding through receive function", async function () {
            await expect(bidder1.sendTransaction({ to: auction.target, value: bidAmount }))
                .to.emit(auction, "BidPlaced");
        });

        it("Should refund previous bidder when new bid is placed", async function () {
            await auction.connect(bidder1).bidWithETH({ value: bidAmount });

            const initialBalance = await ethers.provider.getBalance(bidder1.address);
            const higherBid = ethers.parseEther("2");

            await auction.connect(bidder2).bidWithETH({ value: higherBid });

            const finalBalance = await ethers.provider.getBalance(bidder1.address);
            const diff = finalBalance - initialBalance;
            expect(diff).to.be.closeTo(bidAmount, ethers.parseEther("0.01")); // 考虑gas费用
        });

        it("Should revert if bid is too low", async function () {
            const lowBid = ethers.parseEther("0.1");

            await expect(
                auction.connect(bidder1).bidWithETH({ value: lowBid })
            ).to.be.revertedWith("Auction: bid must be at least starting price");
        });

        it("Should revert if bid amount is zero", async function () {
            await expect(
                auction.connect(bidder1).bidWithETH({ value: 0 })
            ).to.be.revertedWith("Auction: bid amount must be greater than zero");
        });

        it("Should revert if auction has ended", async function () {
            await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
            await ethers.provider.send("evm_mine");

            await expect(
                auction.connect(bidder1).bidWithETH({ value: bidAmount })
            ).to.be.revertedWith("Auction: already ended");
        });

        it("Should require higher bid than current bid", async function () {
            await auction.connect(bidder1).bidWithETH({ value: bidAmount });

            await expect(
                auction.connect(bidder2).bidWithETH({ value: bidAmount })
            ).to.be.revertedWith("Auction: bid must be higher than current bid");
        });
    });

    describe("Biding with ERC20 token", function () {
        const bidAmount = ethers.parseUnits("2000", 6); // 2000 USDC

        beforeEach(async function () {
            await mockERC20.mint(bidder1.address, ethers.parseUnits("10000", 6));
            await mockERC20.mint(bidder2.address, ethers.parseUnits("10000", 6));

            const MockUSDCPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockUSDCPriceFeed = await MockUSDCPriceFeed.deploy(8, USDC_PRICE);

            await auction.connect(seller).setSupportedToken(mockERC20.target, mockUSDCPriceFeed.target);
        });

        it("Should revert with invalid payment token address", async function () {
            await expect(
                auction.connect(bidder1).bidWithToken(ethers.ZeroAddress, bidAmount)
            ).to.be.revertedWith("Auction: invalid payment token address");
        });

        it("Should revert with zero bid amount", async function () {
            await expect(
                auction.connect(bidder1).bidWithToken(mockERC20.target, 0)
            ).to.be.revertedWith("Auction: bid amount must be greater than zero");
        });

        it("Should allow bidding with ERC20 tokens", async function () {
            await mockERC20.connect(bidder1).approve(auction.target, bidAmount);
            await expect(auction.connect(bidder1).bidWithToken(mockERC20.target, bidAmount))
                .to.emit(auction, "BidPlaced");
        });

        it("Should revert with unsupported token", async function () {
            const MockERC20Unsupported = await ethers.getContractFactory("MockERC20");
            const unsupportedToken = await MockERC20Unsupported.deploy("UNSUPPORTED", "UNS", 18);
            await unsupportedToken.waitForDeployment();
            await expect(
                auction.connect(bidder1).bidWithToken(unsupportedToken.target, bidAmount)
            ).to.be.revertedWith("Auction: unsupported payment token");
        });

        it("Should revert if bid is below starting price", async function () {
            const lowAmount = ethers.parseUnits("500", 6);
            await mockERC20.connect(bidder1).approve(auction.target, lowAmount);

            await expect(
                auction.connect(bidder1).bidWithToken(mockERC20.target, lowAmount)
            ).to.be.revertedWith("Auction: bid must be at least starting price");
        });

        it("Should revert if bid is not higher than current bid", async function () {
            await mockERC20.connect(bidder1).approve(auction.target, bidAmount);
            await auction.connect(bidder1).bidWithToken(mockERC20.target, bidAmount);

            await mockERC20.connect(bidder2).approve(auction.target, bidAmount);
            await expect(
                auction.connect(bidder2).bidWithToken(mockERC20.target, bidAmount)
            ).to.be.revertedWith("Auction: bid must be higher than current bid");
        });

        it("Should revert if auction has ended", async function () {
            await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
            await ethers.provider.send("evm_mine");

            await expect(
                auction.connect(bidder1).bidWithToken(mockERC20.target, bidAmount)
            ).to.be.revertedWith("Auction: already ended");
        });

        it("Should transfer tokens from bidder to auction contract", async function () {
            const initialBalance = await mockERC20.balanceOf(bidder1.address);
            const auctionInitialBalance = await mockERC20.balanceOf(auction.target);

            await mockERC20.connect(bidder1).approve(auction.target, bidAmount);
            await auction.connect(bidder1).bidWithToken(mockERC20.target, bidAmount);

            const finalBalance = await mockERC20.balanceOf(bidder1.address);
            const auctionFinalBalance = await mockERC20.balanceOf(auction.target);

            expect(finalBalance).to.equal(initialBalance - bidAmount);
            expect(auctionFinalBalance).to.equal(auctionInitialBalance + bidAmount);
        });

        it("Should refund previous ERC20 bidder when new token bid is placed", async function () {
            await mockERC20.connect(bidder1).approve(auction.target, bidAmount);
            await auction.connect(bidder1).bidWithToken(mockERC20.target, bidAmount);

            const initialBalance = await mockERC20.balanceOf(bidder1.address);
            const higherBid = ethers.parseUnits("3000", 6);
            await mockERC20.connect(bidder2).approve(auction.target, higherBid);
            await auction.connect(bidder2).bidWithToken(mockERC20.target, higherBid);

            const finalBalance = await mockERC20.balanceOf(bidder1.address);
            expect(finalBalance).to.equal(initialBalance + bidAmount);
        });

        it("Should refund previous ETH bidder when new token bid is placed", async function () {
            // 先用ETH竞拍
            const ethBid = ethers.parseEther("1");
            await auction.connect(bidder1).bidWithETH({ value: ethBid });

            const bidder1ETHBalance = await ethers.provider.getBalance(bidder1.address);

            // 用ERC20代币出更高价
            const higherBid = ethers.parseUnits("3000", 6);
            await mockERC20.connect(bidder2).approve(auction.target, higherBid);
            await auction.connect(bidder2).bidWithToken(mockERC20.target, higherBid);

            const bidder1FinalETHBalance = await ethers.provider.getBalance(bidder1.address);

            // bidder1 应该收到ETH退款
            expect(bidder1FinalETHBalance).to.equal(bidder1ETHBalance + ethBid);
        });

        it("Should correctly calculate USD value for token bids", async function () {
            await mockERC20.connect(bidder1).approve(auction.target, bidAmount);
            await auction.connect(bidder1).bidWithToken(mockERC20.target, bidAmount);

            const info = await auction.getAuctionInfo();

            expect(info.currentBidUSD).to.be.closeTo(
                ethers.parseUnits("2000", 18), 
                ethers.parseUnits("10", 18) // 允许 $10 的误差
            );
        });

        it("Should emit BidPlaced event with correct parameters", async function () {
            await mockERC20.connect(bidder1).approve(auction.target, bidAmount);

            await expect(
                auction.connect(bidder1).bidWithToken(mockERC20.target, bidAmount)
            ).to.emit(auction, "BidPlaced")
            .withArgs(
                bidder1.address,
                anyValue,
                mockERC20.target,
                bidAmount
            );
        });

        it("Should handle insufficient allowance", async function () {
            // 只授权一半的金额
            const halfAmount = bidAmount / 2n;
            await mockERC20.connect(bidder1).approve(auction.target, halfAmount);

            try {
                await auction.connect(bidder1).bidWithToken(mockERC20.target, bidAmount);
                expect.fail("Expected transaction to be reverted");
            } catch (error) {
                // 检查错误是否与ERC20相关（allowance或balance不足）
                expect(error.message).to.match(/(allowance|balance|ERC20|insufficient)/i);
            }
        });
    });
    
    describe("Auction ending and claiming", function () {
        const ethBid = ethers.parseEther("1");

        beforeEach(async function () {
            await auction.connect(bidder1).bidWithETH({ value: ethBid });
        });

        it("Should end auction after time expires", async function () {
            await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
            await ethers.provider.send("evm_mine");

            await expect(auction.endAuction())
                .to.emit(auction, "AuctionEnded");

            const info = await auction.getAuctionInfo();
            expect(info.ended).to.be.true;
        });

        it("Should allow winner to claim NFT", async function () {
            await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
            await ethers.provider.send("evm_mine");
            await auction.endAuction();

            await expect(auction.connect(bidder1).claimNFT())
                .to.emit(auction, "NFTClaimed")
                .withArgs(bidder1.address, TOKEN_ID);

            expect(await mockNFT.ownerOf(TOKEN_ID)).to.equal(bidder1.address);
        });

        it("Should allow seller to claim payment", async function () {
            await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
            await ethers.provider.send("evm_mine");
            await auction.endAuction();

            const initialBalance = await ethers.provider.getBalance(seller.address);
            
            await expect(auction.connect(seller).claimPayment())
                .to.emit(auction, "PaymentClaimed");

            const finalBalance = await ethers.provider.getBalance(seller.address);
            expect(finalBalance).to.be.gt(initialBalance);
        });
    });
});