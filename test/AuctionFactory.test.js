const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("AuctionFactory", function () {
    let auctionFactory;
    let auction;
    let mockNFT;
    let mockERC20;
    let mockPriceFeed;
    let owner, seller, buyer, addrs;

    const STARTING_PRICE_USD = ethers.parseUnits("1000", 18);
    const DURATION = 7 * 24 * 60 * 60; // 7 days
    const TOKEN_ID = 1;

    const ETH_PRICE = 2000 * 10 ** 8; // $2000 in 8 decimals
    const USDC_PRICE = 1 * 10 ** 8; // $1 in 8 decimals

    beforeEach(async function () {
        [owner, seller, buyer, ...addrs] = await ethers.getSigners();

        const MockERC721 = await ethers.getContractFactory("MockERC721");
        mockNFT = await MockERC721.deploy();
        await mockNFT.waitForDeployment();
        await mockNFT.mint(seller.address, TOKEN_ID);

        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = await MockPriceFeed.deploy(8, ETH_PRICE);
        await mockPriceFeed.waitForDeployment();

        const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
        auctionFactory = await AuctionFactory.deploy(owner.address);
        await auctionFactory.waitForDeployment();

        await mockNFT.connect(seller).setApprovalForAll(auctionFactory.target, true);
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await auctionFactory.owner()).to.equal(owner.address);
        });

        it("Should deploy initial auction implementation", async function () {
            const implementation = await auctionFactory.auctionImplementation();
            expect(implementation).to.not.equal(ethers.ZeroAddress);
        });

        it("Should set initial implementation version to 1", async function () {
            expect(await auctionFactory.implementationVersion()).to.equal(1);
        });

        it("Should initialize empty auctions array", async function () {
            const allAuctions = await auctionFactory.getAuctions();
            expect(allAuctions.length).to.equal(0);
        });
    });

    describe("Create Auction", function () {

        it("Should create auction with valid parameters", async function() {
            const tx = await auctionFactory.createAuction(
                seller.address,
                mockNFT.target,
                TOKEN_ID,
                STARTING_PRICE_USD,
                DURATION,
                mockPriceFeed.target
            );
            const receipt = await tx.wait();
            const auctionAddress = await auctionFactory.getAuction(mockNFT.target, TOKEN_ID);
            expect(auctionAddress).to.not.equal(ethers.ZeroAddress);
        });

        it("Should revert with invalid seller address", async function() {
            await expect(
                auctionFactory.createAuction(
                    ethers.ZeroAddress,
                    mockNFT.target,
                    TOKEN_ID,
                    STARTING_PRICE_USD,
                    DURATION,
                    mockPriceFeed.target
                )
            ).to.be.revertedWith("AuctionFactory: invalid seller address");
        });

        it("Should revert with invalid NFT address", async function() {
            await expect(
                auctionFactory.createAuction(
                    seller.address,
                    ethers.ZeroAddress,
                    TOKEN_ID,
                    STARTING_PRICE_USD,
                    DURATION,
                    mockPriceFeed.target
                )
            ).to.be.revertedWith("AuctionFactory: invalid NFT address");
        });

        it("Should revert with zero starting price", async function() {
            await expect(
                auctionFactory.createAuction(
                    seller.address,
                    mockNFT.target,
                    TOKEN_ID,
                    0,
                    DURATION,
                    mockPriceFeed.target
                )
            ).to.be.revertedWith("AuctionFactory: starting price must be greater than zero");
        });

        it("Should revert with zero duration", async function() {
            await expect(
                auctionFactory.createAuction(
                    seller.address,
                    mockNFT.target,
                    TOKEN_ID,
                    STARTING_PRICE_USD,
                    0,
                    mockPriceFeed.target
                )
            ).to.be.revertedWith("AuctionFactory: invalid duration");
        });

        it("Should revert when auction already exists for same NFT+TokenId", async function() {
            await auctionFactory.createAuction(
                seller.address,
                mockNFT.target,
                TOKEN_ID,
                STARTING_PRICE_USD,
                DURATION,
                mockPriceFeed.target
            );

            await mockNFT.mint(seller.address, TOKEN_ID + 1);
            await mockNFT.connect(seller).approve(auctionFactory.target, TOKEN_ID + 1);

            await expect(
                auctionFactory.createAuction(
                    seller.address,
                    mockNFT.target,
                    TOKEN_ID,
                    STARTING_PRICE_USD,
                    DURATION,
                    mockPriceFeed.target
                )
            ).to.be.revertedWith("AuctionFactory: auction already exists");
        });

        it("Should allow multiple auctions for different NFTs or tokenIds", async function() {
            await auctionFactory.createAuction(
                seller.address,
                mockNFT.target,
                TOKEN_ID,
                STARTING_PRICE_USD,
                DURATION,
                mockPriceFeed.target
            );

            const TOKEN_ID_2 = 2;
            await mockNFT.mint(seller.address, TOKEN_ID_2);
            await mockNFT.connect(seller).approve(auctionFactory.target, TOKEN_ID_2);

            await expect(
                auctionFactory.createAuction(
                    seller.address,
                    mockNFT.target,
                    TOKEN_ID_2,
                    STARTING_PRICE_USD,
                    DURATION,
                    mockPriceFeed.target
                )
            ).to.not.be.reverted;

            const allAuctions = await auctionFactory.getAuctions();
            expect(allAuctions.length).to.equal(2);
        });
    });

    describe("Get Functions", function() {
        beforeEach(async function () {
            await auctionFactory.createAuction(
                seller.address,
                mockNFT.target,
                TOKEN_ID,
                STARTING_PRICE_USD,
                DURATION,
                mockPriceFeed.target
            );
        });

        it("Should return correct auction address for NFT+TokenId", async function() {
            const auctionAddress = await auctionFactory.getAuction(mockNFT.target, TOKEN_ID);
            expect(auctionAddress).to.not.equal(ethers.ZeroAddress);
        });

        it("Should return zero address for non-existent auction", async function() {
            const auctionAddress = await auctionFactory.getAuction(mockNFT.target, 999);
            expect(auctionAddress).to.equal(ethers.ZeroAddress);
        });

        it("Should return all created auctions", async function () {
            const allAuctions = await auctionFactory.getAuctions();
            expect(allAuctions.length).to.equal(1);

            const TOKEN_ID_2 = 2;
            await mockNFT.mint(seller.address, TOKEN_ID_2);
            await mockNFT.connect(seller).approve(auctionFactory.target, TOKEN_ID_2);
            
            await auctionFactory.createAuction(
                seller.address,
                mockNFT.target,
                TOKEN_ID_2,
                STARTING_PRICE_USD,
                DURATION,
                mockPriceFeed.target
            );

            const updatedAuctions = await auctionFactory.getAuctions();
            expect(updatedAuctions.length).to.equal(2);
        });
    });

    describe("Upgrade Implementation", function() {
        let newImplementation;

        beforeEach(async function () {
            const AuctionV2 = await ethers.getContractFactory("AuctionV2");
            newImplementation = await AuctionV2.deploy();
            await newImplementation.waitForDeployment();
        });

        it("Should upgrade implementation by owner", async function () {
            const oldImplementation = await auctionFactory.auctionImplementation();
            const oldVersion = await auctionFactory.implementationVersion();

            const tx = await auctionFactory.connect(owner).upgradeImplementation(newImplementation.target);

            expect(await auctionFactory.auctionImplementation()).to.equal(newImplementation.target);
            expect(await auctionFactory.implementationVersion()).to.equal(oldVersion + 1n);

            await expect(tx)
                .to.emit(auctionFactory, "AuctionImplementationUpgraded")
                .withArgs(oldVersion + 1n, oldImplementation, newImplementation.target);
        });

        it("Should revert when non-owner tries to upgrade", async function () {
            await expect(
                auctionFactory.connect(seller).upgradeImplementation(newImplementation.target)
            ).to.be.revertedWithCustomError(auctionFactory, "OwnableUnauthorizedAccount");
        });

        it("Should revert with invalid implementation address", async function () {
            await expect(
                auctionFactory.connect(owner).upgradeImplementation(ethers.ZeroAddress)
            ).to.be.revertedWith("AuctionFactory: invalid implementation");
        });

        it("Should use new implementation for new auctions after upgrade", async function () {
            await auctionFactory.connect(owner).upgradeImplementation(newImplementation.target);

            const TOKEN_ID_2 = 2;
            await mockNFT.mint(seller.address, TOKEN_ID_2);
            await mockNFT.connect(seller).approve(auctionFactory.target, TOKEN_ID_2);

            await expect(
                auctionFactory.createAuction(
                    seller.address,
                    mockNFT.target,
                    TOKEN_ID_2,
                    STARTING_PRICE_USD,
                    DURATION,
                    mockPriceFeed.target
                )
            ).to.not.be.reverted;

            const auctionAddress = await auctionFactory.getAuction(mockNFT.target, TOKEN_ID_2);
            expect(auctionAddress).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("Integration with Auction Contract", function () {
        let auctionAddress;
        let auctionContract;

        beforeEach(async function () {
            const tx = await auctionFactory.createAuction(
                seller.address,
                mockNFT.target,
                TOKEN_ID,
                STARTING_PRICE_USD,
                DURATION,
                mockPriceFeed.target
            );
            auctionAddress = await auctionFactory.getAuction(mockNFT.target, TOKEN_ID);

            const Auction = await ethers.getContractFactory("Auction");
            auctionContract = Auction.attach(auctionAddress);
        });

        it("Should properly initialize auction contract", async function () {
            const auctionInfo = await auctionContract.getAuctionInfo();
            expect(auctionInfo.seller).to.equal(seller.address);
            expect(auctionInfo.nftAddress).to.equal(mockNFT.target);
            expect(auctionInfo.tokenId).to.equal(TOKEN_ID);
            expect(auctionInfo.startingPriceUSD).to.equal(STARTING_PRICE_USD);
            expect(auctionInfo.ended).to.equal(false);
        });

        it("Should transfer NFT to auction contract", async function () {
            expect(await mockNFT.ownerOf(TOKEN_ID)).to.equal(auctionAddress);
        });

        it("Should allow bidding on created auction", async function () {
            const requiredETH = ethers.parseEther("0.6");
            
            await expect(
                auctionContract.connect(buyer).bidWithETH({ value: requiredETH })
            ).to.not.be.reverted;

            const auctionInfo = await auctionContract.getAuctionInfo();
            expect(auctionInfo.currentBidder).to.equal(buyer.address);
        });
    });
});