const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
  const [deployer] = await ethers.getSigners();

    console.log("Upgrading contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    try {
        // 1. 获取部署信息
        let deploymentInfo;
        try {
            const deploymentData = fs.readFileSync('deployment.json', 'utf8');
            deploymentInfo = JSON.parse(deploymentData);
            console.log("Loaded deployment info:", deploymentInfo);
        } catch (error) {
            console.error("Error reading deployment.json:", error);
            process.exit(1);
        }

        const factoryAddress = deploymentInfo.contracts.auctionFactory;
        console.log("Using AuctionFactory at:", factoryAddress);

        // 2. 获取AuctionFactory实例
        const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
        const auctionFactory = AuctionFactory.attach(factoryAddress);
        console.log("Attached to AuctionFactory:", auctionFactory.address);

        // 3. 检查当前实现合约信息
        const currentImplementation = await auctionFactory.auctionImplementation();
        const currentVersion = await auctionFactory.implementationVersion();
        console.log("Current implementation address:", currentImplementation);
        console.log("Current implementation version:", currentVersion.toString());

        // 4. 部署新的实现合约
        console.log("\nDeploying new Auction implementation...");
        const AuctionV2 = await ethers.getContractFactory("AuctionV2");
        const auctionV2 = await AuctionV2.deploy();
        await auctionV2.waitForDeployment();
        const newImplementationAddress = await auctionV2.getAddress();
        console.log("New Auction implementation deployed to:", newImplementationAddress);

        // 5. 升级工厂合约的实现地址
        console.log("\nUpgrading AuctionFactory to new implementation...");
        const upgradeTx = await auctionFactory.upgradeImplementation(newImplementationAddress);
        await upgradeTx.wait();
        console.log("AuctionFactory upgraded to new implementation.");

        // 6. 验证升级
        const updatedImplementation = await auctionFactory.auctionImplementation();
        const updatedVersion = await auctionFactory.implementationVersion();
        console.log("Updated implementation address:", updatedImplementation);
        console.log("Updated implementation version:", updatedVersion.toString());

        // 7. 获取当前网络信息
        const network = await ethers.provider.getNetwork();
        const networkName = network.name === "unknown" ? `chainId-${network.chainId}` : network.name;
        
        // 8. 输出升级信息
        console.log("\n=== Upgrade Summary ===");
        console.log("Network:", networkName);
        console.log("Deployer:", deployer.address);
        console.log("AuctionFactory:", factoryAddress);
        console.log("Old Implementation:", currentImplementation);
        console.log("Old Version:", currentVersion.toString());
        console.log("New Implementation:", newImplementationAddress);
        console.log("New Version:", updatedVersion.toString());

        // 9. 保存升级后的部署地址到文件
        deploymentInfo.lastUpgrade = {
            timestamp: new Date().toISOString(),
            network: networkName,
            chainId: network.chainId.toString(),
            oldImplementation: currentImplementation,
            oldVersion: currentVersion.toString(),
            newImplementation: newImplementationAddress,
            newVersion: updatedVersion.toString()
        };
        deploymentInfo.contracts.auctionImplementation = newImplementationAddress;
        deploymentInfo.contracts.implementationVersion = updatedVersion.toString();
        
        fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
        console.log("\nUpdated deployment info saved to deployment.json");



    } catch (error) {
        console.error("Error during upgrade:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
module.exports = main;