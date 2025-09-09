# 去中心化 NFT 拍卖平台

一个基于以太坊的去中心化 NFT 拍卖平台，支持多种代币支付，集成 Chainlink 价格预言机，并采用可升级代理模式。

## 目录

- [项目概述](#项目概述)
- [核心功能](#核心功能)
- [技术架构](#技术架构)
- [合约说明](#合约说明)
- [环境要求](#环境要求)
- [安装和配置](#安装和配置)
- [部署步骤](#部署步骤)
- [功能说明](#功能说明)
- [测试说明](#测试说明)
- [合约地址](#合约地址)
- [费用结构](#费用结构)
- [安全考虑](#安全考虑)

## 项目概述

本项目是一个功能完整的去中心化 NFT 拍卖平台，允许用户：
- 创建 NFT 拍卖
- 使用 ETH 或支持的 ERC20 代币进行竞拍
- 基于实时汇率的美元计价系统
- 动态手续费结构
- 可升级的智能合约架构

## 核心功能

### 拍卖工厂 (AuctionFactory)
- **批量创建拍卖**：通过工厂模式创建标准化的拍卖合约
- **代理模式部署**：使用 UUPS 代理实现可升级性
- **实现合约管理**：支持升级拍卖合约实现
- **拍卖记录**：维护所有已创建拍卖的索引

### 拍卖合约 (Auction)
- **多币种支付**：支持 ETH 和 USDC 等 ERC20 代币
- **实时价格转换**：集成 Chainlink 价格预言机
- **美元计价**：所有出价以美元为基准进行比较
- **动态手续费**：根据成交金额采用分层费率
- **安全机制**：防重入攻击、权限控制等

### NFT 合约
- **标准 ERC721**：完全兼容的 NFT 实现
- **批量铸造**：支持一次性铸造多个 NFT
- **元数据存储**：支持自定义 URI 和元数据

## 技术架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AuctionFactory │    │   Auction Proxy │    │ Chainlink Oracle│
│                 │    │                 │    │                 │
│ - Create Auction│────▶│ - Bid with ETH  │────▶│ - ETH/USD Feed  │
│ - Track Auctions│    │ - Bid with Token│    │ - USDC/USD Feed │
│ - Upgrade Logic │    │ - End Auction   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │      NFT        │
         └─────────────▶│                 │
                        │ - ERC721        │
                        │ - Batch Mint    │
                        │ - URI Storage   │
                        └─────────────────┘
```

## 合约说明

### AuctionFactory.sol
拍卖工厂合约，负责创建和管理拍卖实例。

**主要功能：**
- `createAuction()` - 创建新的拍卖
- `getAuctions()` - 获取所有拍卖列表
- `upgradeImplementation()` - 升级拍卖合约实现

### Auction.sol / AuctionV2.sol
拍卖逻辑合约，采用可升级代理模式。

**主要功能：**
- `bidWithETH()` - 使用 ETH 竞拍
- `bidWithToken()` - 使用 ERC20 代币竞拍
- `endAuction()` - 结束拍卖
- `claimNFT()` - 获胜者领取 NFT
- `claimPayment()` - 卖家领取付款

### NFT.sol
标准的 ERC721 NFT 合约。

**主要功能：**
- `mint()` - 铸造单个 NFT
- `batchMint()` - 批量铸造 NFT

## 🔧 环境要求

- Node.js >= 16.0.0
- npm 或 yarn
- Git

## 安装和配置

### 1. 克隆项目
```bash
git clone https://github.com/miffyG/solidity_learn_task3.git
cd solidity_learn_task3
```

### 2. 安装依赖
```bash
npm install
```

### 3. 环境配置
创建 `.env` 文件并配置以下变量：

```env
# 网络配置
SEPOLIA_RPC_URL=YOUR_SEPOLIA_RPC_URL
PRIVATE_KEY=your_private_key_here

# API Keys
ETHERSCAN_API_KEY=your_etherscan_api_key

# 可选
REPORT_GAS=true
```

**安全提醒：**
- 不要将私钥提交到版本控制
- 使用测试网络进行开发和测试
- 确保私钥对应的账户有足够的测试 ETH

## 部署步骤

### 1. 编译合约
```bash
npm run compile
```

### 2. 运行测试
```bash
# 运行所有测试
npm run test

# 运行特定测试
npm run test:factory
npm run test:auction
npm run test:nft
```

### 3. 部署到 Sepolia 测试网
```bash
npm run deploy
```

部署完成后，会在项目根目录生成 `deployment.json` 文件，包含所有合约地址。

### 4. 升级拍卖合约（可选）
如果需要升级拍卖合约实现：
```bash
npm run upgrade
```

## 功能说明

### 创建 NFT 拍卖

调用 `createAuction()` 函数创建新的拍卖。注意：调用前需要确保 AuctionFactory 合约已获得转移该 NFT 的授权。

```solidity
// 创建拍卖
auctionFactory.createAuction(
    seller,           // 卖家地址
    nftAddress,       // NFT 合约地址
    tokenId,          // NFT Token ID
    startingPriceUSD, // 起始价格（美元，18位小数）
    duration,         // 拍卖时长（秒）
    ethPriceFeed      // ETH 价格预言机地址
);
```

**工作流程：**
1. AuctionFactory 首先将 NFT 从卖家转移到自己
2. 创建拍卖代理合约并初始化
3. 将 NFT 转移到新创建的拍卖合约

### 参与竞拍

#### 使用 ETH 竞拍
```solidity
// 直接发送 ETH
auction.bidWithETH{value: bidAmount}();

// 或者发送 ETH 到合约地址（会自动调用 bidWithETH）
```

#### 使用 ERC20 代币竞拍
```solidity
// 1. 授权代币转移
token.approve(auctionAddress, bidAmount);

// 2. 进行竞拍
auction.bidWithToken(tokenAddress, bidAmount);
```

### 结束拍卖和领取

```solidity
// 1. 结束拍卖
auction.endAuction();

// 2. 获胜者领取 NFT
auction.claimNFT();

// 3. 卖家领取付款
auction.claimPayment();
```

## 测试说明

项目包含完整的测试套件：

### 运行测试
```bash
# 所有测试
npm test

# 工厂合约测试
npm run test:factory

# 拍卖合约测试  
npm run test:auction

# NFT 合约测试
npm run test:nft

# 生成测试覆盖率报告
npm run coverage
```

### 测试覆盖范围
- ✅ 合约部署和初始化
- ✅ 拍卖创建和管理
- ✅ 多币种竞拍逻辑
- ✅ 价格预言机集成
- ✅ 费用计算
- ✅ 权限控制
- ✅ 异常处理
- ✅ 合约升级

## 合约地址

部署完成后的合约地址将保存在 `deployment.json` 文件中：

```json
{
  "network": "sepolia",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "deployer": "0x...",
  "contracts": {
    "auctionFactory": "0x...",
    "auctionImplementation": "0x...",
    "implementationVersion": "1"
  }
}
```

### Sepolia 测试网预言机地址
- **ETH/USD**: `0x694AA1769357215DE4FAC081bf1f309aDC325306`
- **USDC/USD**: `0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E`

## 费用结构

本平台采用动态手续费机制，根据成交金额分层收费：

| 成交金额（USD） | 手续费率 | 示例 |
|----------------|----------|------|
| < $1,000       | 2.5%     | $100 成交 → $2.5 手续费 |
| $1,000 - $9,999| 2.0%     | $5,000 成交 → $100 手续费 |
| $10,000 - $99,999| 1.5%   | $50,000 成交 → $750 手续费 |
| ≥ $100,000     | 1.0%     | $200,000 成交 → $2,000 手续费 |

## 安全考虑

### 已实现的安全措施
- ✅ **重入攻击防护**：使用 ReentrancyGuard
- ✅ **权限控制**：基于 OpenZeppelin Ownable
- ✅ **安全的代币转移**：使用 SafeERC20
- ✅ **输入验证**：全面的参数检查
- ✅ **时间锁定**：拍卖时间控制
- ✅ **价格验证**：预言机数据验证

## 开发工具

- **Hardhat**：开发环境和测试框架
- **OpenZeppelin**：安全的智能合约库
- **Chainlink**：去中心化预言机网络
- **Ethers.js**：以太坊交互库

**⚠️ 免责声明：本项目仅用于学习和研究目的。在生产环境中使用前，请进行充分的测试和安全审计。**
