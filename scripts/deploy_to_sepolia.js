const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  try {
    // 1. 获取合约工厂
    console.log("\n1. Getting contract factories...");
    const AuctionFactory = await ethers.getContractFactory("AuctionFactory");

    // 2. 部署 AuctionFactory
    console.log("\n2. Deploying AuctionFactory...");
    const auctionFactory = await AuctionFactory.deploy(deployer.address);
    await auctionFactory.waitForDeployment();
    
    const factoryAddress = await auctionFactory.getAddress();
    console.log("AuctionFactory deployed to:", factoryAddress);

    // 3. 获取自动部署的实现合约地址
    const implementationAddress = await auctionFactory.auctionImplementation();
    console.log("Auction implementation deployed to:", implementationAddress);
    
    // 4. 验证部署
    console.log("\n3. Verifying deployment...");
    const implementationVersion = await auctionFactory.implementationVersion();
    console.log("Implementation version:", implementationVersion.toString());

    // 5. 输出部署信息
    console.log("\n=== Deployment Summary ===");
    console.log("Network: Sepolia Testnet");
    console.log("Deployer:", deployer.address);
    console.log("AuctionFactory:", factoryAddress);
    console.log("Auction Implementation:", implementationAddress);
    console.log("Implementation Version:", implementationVersion.toString());
    
    // 6. 保存部署地址到文件
    const fs = require('fs');
    const deploymentInfo = {
      network: "sepolia",
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        auctionFactory: factoryAddress,
        auctionImplementation: implementationAddress,
        implementationVersion: implementationVersion.toString()
      }
    };
    
    fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
    console.log("\nDeployment info saved to deployment.json");

    return {
      auctionFactory: factoryAddress,
      auctionImplementation: implementationAddress
    };

  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

// 如果直接运行此脚本则执行部署
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;