# EzyVoting: Production Deployment Guide
**Comprehensive guide to deploy a blockchain-based voting system to production.**

---

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Blockchain Deployment](#blockchain-deployment)
3. [Backend Deployment](#backend-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Production Architecture](#production-architecture)
6. [Security Best Practices](#security-best-practices)
7. [Testing & Verification](#testing--verification)
8. [Launch Checklist](#launch-checklist)
9. [Post-Launch Monitoring](#post-launch-monitoring)

---

## Pre-Deployment Checklist

### 1. Prerequisites
- [ ] Node.js v16+ installed
- [ ] Hardhat installed (`npm install -g hardhat`)
- [ ] MetaMask or Web3 wallet with testnet ETH
- [ ] GitHub account for version control
- [ ] Domain name (optional but recommended)
- [ ] MongoDB Atlas account (for backend)
- [ ] Netlify/Vercel account (for frontend)
- [ ] Etherscan account (for contract verification)

### 2. Code Review & Audit
Before deploying to **mainnet**, have your smart contract audited:
- [ ] Run Slither security analysis: `pip install slither-analyzer && slither contracts/EzyVoting.sol`
- [ ] Use MythX or OpenZeppelin Defender for vulnerability scanning
- [ ] Review contract logic with team
- [ ] Test all edge cases locally

### 3. Environment Setup
Create `.env` files in each directory with secure values:
```bash
# Root directory: .env
PRIVATE_KEY=your_private_key_here
RPC_URL=your_rpc_endpoint
ETHERSCAN_API_KEY=your_etherscan_key

# For testnet (DO NOT use mainnet keys on public repos)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
SEPOLIA_PRIVATE_KEY=test_key_only
```

---

## Blockchain Deployment

### Phase 1: Testnet Deployment (Sepolia)

#### Step 1: Configure Hardhat
Update [hardhat.config.js](hardhat.config.js):

```javascript
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL,
      accounts: process.env.POLYGON_PRIVATE_KEY ? [process.env.POLYGON_PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL,
      accounts: process.env.MAINNET_PRIVATE_KEY ? [process.env.MAINNET_PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY,
      polygon: process.env.POLYGONSCAN_API_KEY,
      mainnet: process.env.ETHERSCAN_API_KEY,
    },
  },
};
```

#### Step 2: Compile Contract
```bash
npm install
npm run compile
```

#### Step 3: Create Deployment Script
Create [scripts/deploy-production.js](scripts/deploy-production.js):

```javascript
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log(`\n🚀 Deploying to ${network}`);
  console.log(`📍 Deployer address: ${deployer.address}`);
  
  // Check balance
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(`💰 Account balance: ${hre.ethers.formatEther(balance)} ETH\n`);
  
  if (balance === 0n) {
    throw new Error('❌ Insufficient funds for deployment');
  }

  // Deploy contract
  const EzyVoting = await hre.ethers.getContractFactory('EzyVoting');
  console.log('⏳ Deploying EzyVoting contract...');
  
  const ezyVoting = await EzyVoting.deploy();
  await ezyVoting.waitForDeployment();
  
  const contractAddress = await ezyVoting.getAddress();
  console.log(`✅ Contract deployed to: ${contractAddress}\n`);

  // Save deployment details
  const deploymentInfo = {
    network: network,
    contractAddress: contractAddress,
    deployerAddress: deployer.address,
    timestamp: new Date().toISOString(),
    blockNumber: await deployer.provider.getBlockNumber(),
  };

  const filePath = path.join(__dirname, `../deployments/${network}-deployment.json`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`📝 Deployment info saved to: ${filePath}`);
  
  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
```

#### Step 4: Deploy to Sepolia
```bash
# Get testnet ETH from faucet
# https://sepolia-faucet.pk910.de/

# Deploy
npx hardhat run scripts/deploy-production.js --network sepolia
```

#### Step 5: Verify Contract on Etherscan
Create [scripts/verify-production.js](scripts/verify-production.js):

```javascript
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const network = hre.network.name;
  const deploymentFile = path.join(__dirname, `../deployments/${network}-deployment.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    throw new Error('Deployment file not found');
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));
  const contractAddress = deployment.contractAddress;

  console.log(`\n🔍 Verifying contract on ${network}...`);
  console.log(`📍 Contract: ${contractAddress}\n`);

  try {
    await hre.run('verify:verify', {
      address: contractAddress,
      constructorArguments: [],
    });
    console.log('✅ Contract verified successfully!');
  } catch (error) {
    if (error.message.includes('Already Verified')) {
      console.log('✅ Contract already verified');
    } else {
      throw error;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  });
```

```bash
npx hardhat run scripts/verify-production.js --network sepolia
```

#### Step 6: Export Contract ABI
Create [scripts/export-abi.js](scripts/export-abi.js):

```javascript
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const artifact = await hre.artifacts.readArtifact('EzyVoting');
  
  const abiPath = path.join(__dirname, '../frontend/lib/abi/EzyVoting.json');
  fs.mkdirSync(path.dirname(abiPath), { recursive: true });
  fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
  
  console.log(`✅ ABI exported to: ${abiPath}`);
}

main().catch(console.error);
```

```bash
npx hardhat run scripts/export-abi.js
```

### Phase 2: Mainnet Deployment (Optional)

**⚠️ WARNING: Mainnet deployment uses real funds. Only proceed if:**
- Contract has been audited
- All tests pass
- Large amount of testnet testing completed
- You understand gas costs

```bash
# Deploy to mainnet (use different private key)
npx hardhat run scripts/deploy-production.js --network mainnet

# Verify on mainnet
npx hardhat run scripts/verify-production.js --network mainnet
```

### Network Comparison

| Network | Use Case | Cost | Speed | Finality |
|---------|----------|------|-------|----------|
| **Sepolia** | Testing | ✅ Free (faucet) | Fast | 12 sec |
| **Polygon** | Demo/Production | ✅ Cheap | Very Fast | 2-3 sec |
| **Ethereum** | Production | ❌ Expensive | Slow | 12 sec |

**Recommendation:** Deploy to **Sepolia first**, then move to **Polygon for production** (lower gas fees, faster confirmations).

---

## Backend Deployment

### Step 1: Pre-Production Configuration

Update [backend/.env.production](backend/.env.production):

```env
# Server
PORT=4000
NODE_ENV=production

# Database
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/ezyvoting-prod?retryWrites=true&w=majority

# Blockchain
CONTRACT_ADDRESS=0x_your_deployed_contract_address_
NETWORK=sepolia
RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY

# JWT
JWT_SECRET=your_very_secure_random_string_here
JWT_EXPIRY=7d

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Step 2: Create Enhanced Backend Server

Update [backend/src/index.js](backend/src/index.js):

```javascript
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// Security middleware
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api/', limiter);

const PORT = process.env.PORT || 4000;

// Database connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/blockchain', require('./routes/blockchain'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
});
```

### Step 3: Deploy to Cloud

#### Option A: Render (Free tier available)

1. Push code to GitHub
2. Go to https://render.com
3. Click "New +" → "Web Service"
4. Connect GitHub repo
5. Configure:
   - **Name:** ezyvoting-backend
   - **Runtime:** Node
   - **Build:** `npm install`
   - **Start:** `npm run start`
6. Add environment variables from `.env.production`
7. Deploy

#### Option B: Railway (Recommended for students)

1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Select your repository
4. Add MongoDB plugin (free tier)
5. Set environment variables
6. Deploy

#### Option C: AWS EC2 (Production)

```bash
# SSH into EC2 instance
ssh -i your-key.pem ubuntu@your-instance-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repo
git clone https://github.com/your-repo/ezyvoting.git
cd ezyvoting/backend

# Install PM2 for process management
sudo npm install -g pm2

# Create .env file
nano .env.production

# Start app
pm2 start src/index.js --name "ezyvoting-backend" --env production

# Enable startup on reboot
pm2 startup
pm2 save

# Setup reverse proxy with Nginx
sudo apt-get install -y nginx
# Configure /etc/nginx/sites-enabled/default to proxy to port 4000
```

### Step 4: Setup Database (MongoDB Atlas)

1. Go to https://cloud.mongodb.com
2. Create free cluster
3. Add IP whitelist (or 0.0.0.0/0 for testing)
4. Create database user
5. Copy connection string
6. Add to `.env`: `MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/ezyvoting-prod?retryWrites=true&w=majority`

---

## Frontend Deployment

### Step 1: Create Environment Configuration

Create [frontend/.env.production.local](frontend/.env.production.local):

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x_your_deployed_contract_address_
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_ETHERSCAN_URL=https://sepolia.etherscan.io
```

### Step 2: Update Contract Integration

Create [frontend/lib/web3Config.js](frontend/lib/web3Config.js):

```javascript
export const network = {
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpc: process.env.NEXT_PUBLIC_RPC_URL,
    explorer: 'https://sepolia.etherscan.io',
  },
  polygon: {
    chainId: 137,
    name: 'Polygon Mainnet',
    rpc: 'https://polygon-rpc.com',
    explorer: 'https://polygonscan.com',
  },
};

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
export const NETWORK_NAME = process.env.NEXT_PUBLIC_NETWORK;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
export const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Validate configuration
if (!CONTRACT_ADDRESS || !CONTRACT_ADDRESS.startsWith('0x')) {
  throw new Error('Invalid CONTRACT_ADDRESS');
}
```

### Step 3: Create Provider Hook

Create [frontend/hooks/useProvider.js](frontend/hooks/useProvider.js):

```javascript
import { useEffect, useState } from 'react';
import { BrowserProvider } from 'ethers';
import { CONTRACT_ADDRESS, NETWORK_NAME, network } from '../lib/web3Config';
import EzyVotingABI from '../lib/abi/EzyVoting.json';

export function useProvider() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [contract, setContract] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!window.ethereum) {
      setError('MetaMask not installed');
      return;
    }

    const initProvider = async () => {
      try {
        const prov = new BrowserProvider(window.ethereum);
        setProvider(prov);

        // Get current account
        const accounts = await prov.listAccounts();
        if (accounts.length > 0) {
          setAccount(accounts[0].address);
        }

        // Get chain ID
        const network = await prov.getNetwork();
        setChainId(Number(network.chainId));

        // Initialize contract
        const signer = await prov.getSigner();
        setSigner(signer);

        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          EzyVotingABI,
          signer
        );
        setContract(contract);
      } catch (err) {
        setError(err.message);
      }
    };

    initProvider();

    // Listen for account changes
    window.ethereum?.on?.('accountsChanged', (accounts) => {
      setAccount(accounts[0]);
    });

    // Listen for chain changes
    window.ethereum?.on?.('chainChanged', () => {
      window.location.reload();
    });

    return () => {
      window.ethereum?.removeAllListeners?.();
    };
  }, []);

  const switchNetwork = async (targetNetwork) => {
    try {
      const targetChainId = network[targetNetwork].chainId;
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
    } catch (err) {
      if (err.code === 4902) {
        console.log('Network not found in wallet');
      }
      throw err;
    }
  };

  return {
    provider,
    signer,
    account,
    chainId,
    contract,
    error,
    switchNetwork,
  };
}
```

### Step 4: Build and Deploy

#### Option A: Vercel (Recommended for Next.js)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod --env-file .env.production.local
```

Or directly on Vercel dashboard:
1. Go to https://vercel.com/new
2. Import GitHub repo
3. Add environment variables
4. Deploy

#### Option B: Netlify

```bash
npm run build

# Deploy
netlify deploy --prod --dir=.next
```

#### Option C: Self-hosted (using AWS S3 + CloudFront)

```bash
# Build Next.js app
npm run build
npm run start

# Or export as static (if using SSG)
npm run export

# Deploy to S3
aws s3 sync ./out s3://my-bucket --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id E1234 --paths "/*"
```

---

## Production Architecture

### Recommended Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      END USERS                              │
│            (Desktop/Mobile Browsers)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │    CDN (Cloudflare / CloudFront)     │
        │  Caching & DDoS Protection           │
        └──────────────────┬───────────────────┘
                           │
        ┌──────────────────┴───────────────────┐
        │                                      │
        ▼                                      ▼
┌─────────────────┐                   ┌─────────────────┐
│  FRONTEND       │                   │   BACKEND API   │
│ Vercel/Netlify  │                   │  Railway/Render │
│ ├─ Next.js app  │                   │ ├─ Express.js   │
│ ├─ Web3 wallet  │                   │ ├─ MongoDB      │
│ │  integration  │                   │ ├─ Rate Limit   │
│ └─ ethers.js    │                   │ └─ Auth (JWT)   │
└────────┬────────┘                   └────────┬────────┘
         │                                     │
         └──────────────┬──────────────────────┘
                        │
                        ▼
            ┌──────────────────────────┐
            │  RPC ENDPOINT (Infura)   │
            │  or (Alchemy)            │
            └──────────────┬───────────┘
                           │
                           ▼
   ┌───────────────────────────────────────────┐
   │   ETHEREUM / POLYGON BLOCKCHAIN           │
   │                                           │
   │  ┌──────────────────────────────────────┐ │
   │  │  EzyVoting Smart Contract            │ │
   │  │  ├─ Voter Registration               │ │
   │  │  ├─ Candidate Management             │ │
   │  │  ├─ Election Logic                   │ │
   │  │  └─ Vote Casting & Results           │ │
   │  └──────────────────────────────────────┘ │
   │                                           │
   │  ┌──────────────────────────────────────┐ │
   │  │  Contract Events & State Changes     │ │
   │  └──────────────────────────────────────┘ │
   └───────────────────────────────────────────┘
```

### Directory Structure for Production

```
ezyvoting/
├── contracts/
│   ├── EzyVoting.sol          # Main smart contract
│   ├── interfaces/            # Contract interfaces
│   └── libraries/             # Reusable libraries
│
├── scripts/
│   ├── deploy-production.js   # Production deploy script
│   ├── verify-production.js   # Etherscan verification
│   ├── export-abi.js          # Export contract ABI
│   └── seed-production.js     # Initialize production data
│
├── deployments/
│   ├── sepolia-deployment.json      # Sepolia deployment info
│   ├── polygon-deployment.json      # Polygon deployment info
│   └── mainnet-deployment.json      # Mainnet deployment info
│
├── backend/
│   ├── .env.production        # Production environment
│   ├── src/
│   │   ├── index.js           # Express server
│   │   ├── middleware/
│   │   │   ├── auth.js        # JWT authentication
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js        # Auth endpoints
│   │   │   └── blockchain.js  # Contract interaction
│   │   ├── services/
│   │   │   ├── contractService.js
│   │   │   ├── authService.js
│   │   │   └── ethereumService.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Voter.js
│   │   │   └── Vote.js
│   │   └── utils/
│   │       ├── validators.js
│   │       └── logger.js
│   ├── Dockerfile             # Docker image
│   └── docker-compose.yml     # Local dev environment
│
├── frontend/
│   ├── .env.production.local  # Production environment
│   ├── pages/
│   │   ├── _app.js           # App wrapper
│   │   ├── index.js          # Home page
│   │   ├── admin/
│   │   │   ├── dashboard.js
│   │   │   └── manage-voters.js
│   │   └── voter/
│   │       ├── dashboard.js
│   │       └── vote.js
│   ├── components/
│   │   ├── WalletConnect.js
│   │   ├── ContractForm.js
│   │   └── ErrorBoundary.js
│   ├── lib/
│   │   ├── web3Config.js      # Web3 configuration
│   │   ├── abi/
│   │   │   └── EzyVoting.json # Contract ABI
│   │   └── constants.js       # App constants
│   ├── hooks/
│   │   ├── useProvider.js     # Web3 provider hook
│   │   ├── useContract.js     # Contract interaction
│   │   └── useAuth.js         # Authentication
│   ├── public/
│   │   ├── favicon.ico
│   │   └── logo.png
│   ├── styles/
│   │   ├── globals.css
│   │   └── components.module.css
│   ├── Dockerfile             # Docker image
│   └── vercel.json           # Vercel configuration
│
├── test/
│   ├── EzyVoting.test.js      # Contract tests
│   ├── integration.test.js    # E2E tests
│   └── fixtures/              # Test data
│
├── .env.example               # Example env vars
├── .env.production            # Production env (DO NOT commit)
├── .gitignore                 # Git ignore rules
├── hardhat.config.js          # Hardhat config
├── package.json               # Root dependencies
├── docker-compose.yml         # Local dev setup
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── API.md
│   └── DEPLOYMENT.md
│
└── README.md                  # Project documentation
```

---

## Security Best Practices

### 1. Smart Contract Security

#### Code Review Checklist
- [ ] No reentrancy vulnerabilities
- [ ] No integer overflow/underflow (use SafeMath or Solidity 0.8+)
- [ ] Access control properly implemented
- [ ] No hardcoded addresses or secrets
- [ ] Events properly emitted
- [ ] No external calls to untrusted contracts

#### Required Code Changes in EzyVoting.sol

```solidity
// ✅ Add these improvements

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract EzyVoting is Ownable, ReentrancyGuard {
    // Use constants for gas optimization
    address constant ZERO_ADDRESS = address(0);
    
    // Add event logging for monitoring
    event AdminAdded(address indexed admin);
    event VoteInvalidated(address indexed voter, string reason);
    
    // Add circuit breaker for emergency
    bool public emergencyStop = false;
    
    modifier notEmergency() {
        require(!emergencyStop, "Contract is in emergency mode");
        _;
    }
    
    // Allow owner to stop contract in case of emergency
    function toggleEmergencyStop() external onlyOwner {
        emergencyStop = !emergencyStop;
    }
    
    // Existing code with notEmergency modifier on voting functions
    function vote(uint256 electionId, uint256 candidateId, bytes32 providedHashedVoterId) 
        external 
        notEmergency
        nonReentrant 
    {
        // ... existing vote logic
    }
}
```

### 2. Backend Security

```javascript
// Use helmet for security headers
const helmet = require('helmet');
app.use(helmet());

// Database connection security
mongoose.set('sanitizeFilter', true);

// Input validation
const { body, validationResult } = require('express-validator');

// Example protected route
app.post('/api/blockchain/vote', [
  body('electionId').isInt().toInt(),
  body('candidateId').isInt().toInt(),
  body('hashedVoterId').isCString(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // Process vote...
});

// HTTPS only in production
const https = require('https');
const fs = require('fs');

if (process.env.NODE_ENV === 'production') {
  const options = {
    key: fs.readFileSync('/path/to/key.pem'),
    cert: fs.readFileSync('/path/to/cert.pem'),
  };
  https.createServer(options, app).listen(443);
}
```

### 3. Frontend Security

```javascript
// Validate contract address on every load
if (!ethers.isAddress(CONTRACT_ADDRESS)) {
  throw new Error('Invalid contract address');
}

// Never expose private keys
// Use read-only RPC endpoints

// Sanitize user input before contract calls
const sanitizeInput = (input) => {
  return input.trim().toLowerCase();
};

// Implement content security policy
// In vercel.json or next.config.js:
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline'" }
      ]
    }
  ]
}
```

### 4. Environment Variables Security

**DO NOT commit these files:**
```bash
.env
.env.production
.env.local
private-key.txt
```

**Add to .gitignore:**
```
.env*
!.env.example
.env.production*
keys/
secrets/
node_modules/
.next/
dist/
```

### 5. Rate Limiting & DDoS Protection

```javascript
// Install packages
npm install express-rate-limit redis

// Configure advanced rate limiting
const RedisStore = require('rate-limit-redis');
const redis = require('redis');

const redisClient = redis.createClient();

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per window
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
});

// Apply to specific endpoints
app.post('/api/blockchain/vote', limiter, (req, res) => {
  // Handle vote...
});
```

### 6. Monitoring & Logging

```javascript
// Setup structured logging
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// Log all blockchain interactions
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip,
    timestamp: new Date(),
  });
  next();
});
```

---

## Testing & Verification

### Unit Tests for Smart Contract

Create [test/EzyVoting.test.js](test/EzyVoting.test.js):

```javascript
const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('EzyVoting', function () {
  let contract, owner, admin, voter;

  beforeEach(async function () {
    [owner, admin, voter] = await ethers.getSigners();
    
    const EzyVoting = await ethers.getContractFactory('EzyVoting');
    contract = await EzyVoting.deploy();
    await contract.waitForDeployment();
  });

  describe('Admin Management', function () {
    it('Should add admin', async function () {
      await contract.addAdmin(admin.address);
      expect(await contract.admins(admin.address)).to.be.true;
    });
  });

  describe('Constituency Management', function () {
    it('Should create constituency', async function () {
      await contract.addAdmin(admin.address);
      const tx = await contract.connect(admin).addConstituency('New York');
      
      await expect(tx).to.emit(contract, 'ConstituencyAdded');
    });
  });

  describe('Voting', function () {
    let electionId, candidateId;

    beforeEach(async function () {
      // Setup
      await contract.addAdmin(admin.address);
      await contract.connect(admin).addConstituency('District 1');
      
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + 3600;
      
      const tx1 = await contract.connect(admin).createElection('Election 2024', startTime, endTime);
      const receipt1 = await tx1.wait();
      electionId = 1;
      
      const tx2 = await contract.connect(admin).registerCandidate('Alice', 'Party A', 1);
      const receipt2 = await tx2.wait();
      candidateId = 1;
      
      // Register voter
      const hashedId = ethers.keccak256(ethers.toUtf8Bytes('voter123'));
      await contract.connect(admin).registerVoter(voter.address, hashedId, 1, 'John Doe');
      await contract.connect(admin).startElection(electionId);
    });

    it('Should cast vote successfully', async function () {
      const hashedId = ethers.keccak256(ethers.toUtf8Bytes('voter123'));
      
      const tx = await contract.connect(voter).vote(electionId, candidateId, hashedId);
      
      await expect(tx).to.emit(contract, 'VoteCast')
        .withArgs(voter.address, electionId, candidateId);
    });

    it('Should prevent double voting', async function () {
      const hashedId = ethers.keccak256(ethers.toUtf8Bytes('voter123'));
      
      await contract.connect(voter).vote(electionId, candidateId, hashedId);
      
      await expect(
        contract.connect(voter).vote(electionId, candidateId, hashedId)
      ).to.be.revertedWith('Already voted');
    });
  });
});
```

Run tests:
```bash
npm test
```

### Integration Tests

Create [test/integration.test.js](test/integration.test.js):

```javascript
const axios = require('axios');
const { expect } = require('chai');

const API_URL = process.env.API_URL || 'http://localhost:4000';

describe('End-to-End Voting Flow', function () {
  this.timeout(10000);

  let userToken, adminToken;

  it('Should register voter', async function () {
    const res = await axios.post(`${API_URL}/api/auth/register`, {
      email: 'voter@test.com',
      password: 'Test123!',
      role: 'voter',
    });

    expect(res.status).to.equal(201);
    userToken = res.data.token;
  });

  it('Should get candidates for constituency', async function () {
    const res = await axios.get(
      `${API_URL}/api/blockchain/candidates/1`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );

    expect(res.status).to.equal(200);
    expect(res.data).to.be.an('array');
  });

  it('Should cast vote', async function () {
    const res = await axios.post(
      `${API_URL}/api/blockchain/vote`,
      {
        electionId: 1,
        candidateId: 1,
        hashedVoterId: '0x123...',
      },
      { headers: { Authorization: `Bearer ${userToken}` } }
    );

    expect(res.status).to.equal(200);
  });

  it('Should retrieve results', async function () {
    const res = await axios.get(
      `${API_URL}/api/blockchain/results/1/1`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );

    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('candidates');
  });
});
```

### Manual Testing Checklist

- [ ] **Wallet Connection**
  - MetaMask connects successfully
  - Correct network displayed
  - Account address shown

- [ ] **Admin Functions**
  - Admin can add constituency
  - Admin can register candidates
  - Admin can create election
  - Admin can manage voters

- [ ] **Voter Flow**
  - Voter registers successfully
  - Voter sees candidates for constituency
  - Voter can cast vote
  - Voter cannot vote twice
  - Vote recorded on-chain

- [ ] **Results Display**
  - Results show correct vote counts
  - Results update in real-time
  - Results viewable after election ends

- [ ] **Error Handling**
  - Invalid inputs show error messages
  - Network disconnection handled gracefully
  - Transaction failures show user-friendly errors

---

## Launch Checklist

### 48 Hours Before Launch

- [ ] **Smart Contract**
  - ✅ Security audit completed (or high-confidence self-review)
  - ✅ All tests passing on testnet
  - ✅ Contract deployed to mainnet/production network
  - ✅ Contract verified on Etherscan/Polygonscan
  - ✅ Contract address added to frontend config

- [ ] **Backend**
  - ✅ All endpoints tested and working
  - ✅ Database backups configured
  - ✅ Rate limiting enabled
  - ✅ Error logging set up
  - ✅ Health check endpoint responding
  - ✅ HTTPS certificate valid
  - ✅ Environment variables securely stored

- [ ] **Frontend**
  - ✅ All pages tested in Chrome, Firefox, Safari
  - ✅ MetaMask integration works
  - ✅ Network switching works
  - ✅ Forms validate correctly
  - ✅ Loading states display
  - ✅ Error messages user-friendly
  - ✅ Mobile responsive design tested
  - ✅ Build completes without warnings

- [ ] **Documentation**
  - ✅ README.md complete and up-to-date
  - ✅ API documentation published
  - ✅ User guide for voters created
  - ✅ Admin guide for election setup created
  - ✅ Troubleshooting guide included

- [ ] **Monitoring**
  - ✅ Error tracking (Sentry) configured
  - ✅ Analytics installed
  - ✅ Log aggregation (e.g., LogRocket) set up
  - ✅ Uptime monitoring configured

### Launch Day

- [ ] Create backup of database
- [ ] Monitor logs for errors
- [ ] Test voting flow end-to-end
- [ ] Verify contract events are emitting
- [ ] Check blockchain explorer for transactions
- [ ] Monitor API response times
- [ ] Verify CDN is caching correctly
- [ ] Test on different devices/networks
- [ ] Have rollback plan ready

### Post-Launch (First 24 hours)

- [ ] Monitor error logs for issues
- [ ] Watch support channels for user feedback
- [ ] Check gas prices and optimize if needed
- [ ] Verify data integrity in database
- [ ] Monitor server resource usage
- [ ] Check security alerts/intrusion attempts
- [ ] Document any issues encountered

---

## Post-Launch Monitoring

### Setup Monitoring Dashboard

Use services like:

1. **Sentry** (Error tracking)
   ```javascript
   const Sentry = require("@sentry/node");
   
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV,
   });
   
   app.use(Sentry.Handlers.requestHandler());
   app.use(Sentry.Handlers.errorHandler());
   ```

2. **DataDog** (Infrastructure monitoring)
   - Monitor server CPU, memory, disk
   - Track database query performance
   - Monitor API response times

3. **Etherscan API** (Contract monitoring)
   ```javascript
   async function checkContractStatus() {
     const response = await fetch(
       `https://api.etherscan.io/api?module=account&action=txlist&address=${CONTRACT_ADDRESS}&apikey=${ETHERSCAN_KEY}`
     );
     return response.json();
   }
   ```

### Metrics to Track

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Uptime | 99.9% | < 99.5% |
| Response Time | < 200ms | > 500ms |
| Error Rate | < 0.1% | > 1% |
| Database CPU | < 70% | > 85% |
| Blockchain Gas | - | 2x average |

### Incident Response Plan

1. **Issue Detected**
   - Page on-call engineer
   - Create incident in Slack

2. **Assessment**
   - Determine severity (P1/P2/P3)
   - Check if user-facing

3. **Actions**
   - For frontend issues: Rollback to previous version
   - For backend issues: Check logs, restart if needed
   - For blockchain issues: Halt operations, assess contracts

4. **Resolution**
   - Fix root cause
   - Deploy fix to production
   - Verify fix working
   - Communicate status to users

5. **Post-Mortem**
   - Document what happened
   - Why it happened
   - How to prevent it
   - Share learnings with team

---

## Production Deployment Summary

### Quick Command Reference

```bash
# 1. Compile & Test Locally
npm install
npm run compile
npm test

# 2. Deploy to Testnet
npm run deploy:sepolia
npm run verify:sepolia

# 3. Deploy Backend
cd backend
npm install
npm run build
# Then deploy to Railway/Render/AWS

# 4. Deploy Frontend
cd frontend
npm install
npm run build
npm run start
# Or: vercel --prod

# 5. Export ABI & Update configs
npx hardhat run scripts/export-abi.js

# 6. Run Integration Tests
npm run test:integration

# 7. Monitor
# Check error logs, database, and blockchain Etherscan
```

### Important URLs to Keep

```
Contract Address: 0x...
Etherscan: https://sepolia.etherscan.io/address/0x...
Frontend: https://yourdomain.com
Backend API: https://api.yourdomain.com
Database: MongoDB Atlas cluster
```

---

## Further Resources

- **Smart Contract Security**: https://docs.openzeppelin.com/contracts/4.x/
- **Ethers.js Documentation**: https://docs.ethers.org/v6/
- **Hardhat Documentation**: https://hardhat.org/docs
- **Solidity Security**: https://www.soliditylang.org/docs/security/
- **Next.js Deployment**: https://nextjs.org/docs/deployment
- **Express.js Best Practices**: https://expressjs.com/en/advanced/best-practice-security.html

---

**Last Updated**: February 18, 2026  
**Version**: 1.0.0 - Production Ready
