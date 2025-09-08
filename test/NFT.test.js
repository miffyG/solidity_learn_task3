const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("NFT Contract", function () {
    let NFT, nft, owner, addr1, addr2;

    const NFT_NAME = "Test NFT";
    const NFT_SYMBOL = "TNFT";
    const BASE_URI = "https://example.com/metadata/token/";
    const TOKEN_URI_1 = BASE_URI + "1.json";
    const TOKEN_URI_2 = BASE_URI + "2.json";
    const TOKEN_URI_3 = BASE_URI + "3.json";

    beforeEach(async function() {
        [owner, addr1, addr2] = await ethers.getSigners();
        NFT = await ethers.getContractFactory("NFT");
        nft = await NFT.deploy(NFT_NAME, NFT_SYMBOL);
        await nft.waitForDeployment();
    });

    describe("Deployment", function() {
        it("Should set the correct name and symbol", async function() {
            expect(await nft.name()).to.equal(NFT_NAME);
            expect(await nft.symbol()).to.equal(NFT_SYMBOL);
        });
    });

    describe("Minting", function() {
        it("Should mint a single NFT", async function() {
            const mintTx = await nft.mint(addr1.address, TOKEN_URI_1);
            const receipt = await mintTx.wait();

            expect(await nft.balanceOf(addr1.address)).to.equal(1);
            expect(await nft.ownerOf(0)).to.equal(addr1.address);
            expect(await nft.tokenURI(0)).to.equal(TOKEN_URI_1);
        });

        it("Should return correct token ID when minting", async function() {
            const tokenId = await nft.mint.staticCall(addr1.address, TOKEN_URI_1);
            expect(tokenId).to.equal(0);

            await nft.mint(addr1.address, TOKEN_URI_1);
            
            const nextTokenId = await nft.mint.staticCall(addr1.address, TOKEN_URI_2);
            expect(nextTokenId).to.equal(1);
        });

        it("Should mint multiple NFTs with incremental token IDs", async function () {
            await nft.mint(addr1.address, TOKEN_URI_1);
            await nft.mint(addr1.address, TOKEN_URI_2);
            await nft.mint(addr2.address, TOKEN_URI_3);

            expect(await nft.balanceOf(addr1.address)).to.equal(2);
            expect(await nft.balanceOf(addr2.address)).to.equal(1);
            
            expect(await nft.ownerOf(0)).to.equal(addr1.address);
            expect(await nft.ownerOf(1)).to.equal(addr1.address);
            expect(await nft.ownerOf(2)).to.equal(addr2.address);
        });

        it("Should emit Transfer event when minting", async function () {
            await expect(nft.mint(addr1.address, TOKEN_URI_1))
                .to.emit(nft, "Transfer")
                .withArgs(ethers.ZeroAddress, addr1.address, 0);
        });
    });

    describe("Batch Minting", function() {
        it("Should batch mint multiple NFTs", async function() {
            const uris = [TOKEN_URI_1, TOKEN_URI_2, TOKEN_URI_3];
            const tx = await nft.batchMint(addr1.address, uris);
            const receipt = await tx.wait();

            expect(await nft.balanceOf(addr1.address)).to.equal(3);

            for (let i = 0; i < uris.length; i++) {
                expect(await nft.ownerOf(i)).to.equal(addr1.address);
                expect(await nft.tokenURI(i)).to.equal(uris[i]);
            }
        });

        it("Should return correct token IDs array from batch mint", async function() {
            const uris = [TOKEN_URI_1, TOKEN_URI_2];
            const tokenIds = await nft.batchMint.staticCall(addr1.address, uris);
            expect(tokenIds.length).to.equal(uris.length);
            expect(tokenIds[0]).to.equal(0);
            expect(tokenIds[1]).to.equal(1);
        });

        it("Should batch mint to different address", async function() {
            await nft.batchMint(addr1.address, [TOKEN_URI_1, TOKEN_URI_2]);
            await nft.batchMint(addr2.address, [TOKEN_URI_3]);

            expect(await nft.balanceOf(addr1.address)).to.equal(2);
            expect(await nft.balanceOf(addr2.address)).to.equal(1);
            expect(await nft.ownerOf(2)).to.equal(addr2.address);
            expect(await nft.ownerOf(1)).to.equal(addr1.address);
        });

        it("Should handle empty URI array", async function () {
            const tokenIds = await nft.batchMint.staticCall(addr1.address, []);
            expect(tokenIds).to.have.lengthOf(0);
            expect(await nft.balanceOf(addr1.address)).to.equal(0);
        });

        it("Should emit Transfer events for each minted token", async function () {
            const uris = [TOKEN_URI_1, TOKEN_URI_2];
            const tx = nft.batchMint(addr1.address, uris);
            
            await expect(tx)
                .to.emit(nft, "Transfer")
                .withArgs(ethers.ZeroAddress, addr1.address, 0);
            
            await expect(tx)
                .to.emit(nft, "Transfer")
                .withArgs(ethers.ZeroAddress, addr1.address, 1);
        });
    });

    describe("Token URI", function () {
        beforeEach(async function () {
            await nft.mint(addr1.address, TOKEN_URI_1);
        });

        it("Should return correct token URI", async function () {
            expect(await nft.tokenURI(0)).to.equal(TOKEN_URI_1);
        });

        it("Should revert when querying URI for non-existent token", async function () {
            await expect(nft.tokenURI(999))
                .to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
        });
    });
});