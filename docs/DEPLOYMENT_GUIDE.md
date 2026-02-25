# EzyVoting — Deployment Guide

> Step-by-step instructions for deploying the Blockchain-Based Online Voting System
> from a clean machine to a running production (or testnet) environment.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository Setup](#2-repository-setup)
3. [MySQL Database](#3-mysql-database)
4. [Smart Contract Compilation & Deployment](#4-smart-contract-compilation--deployment)
5. [Flask Backend](#5-flask-backend)
6. [Next.js Frontend](#6-nextjs-frontend)
7. [Sepolia Testnet Deployment](#7-sepolia-testnet-deployment)
8. [Production Checklist](#8-production-checklist)

---

## 1. Prerequisites

| Tool       | Min Version | Install                                           |
| ---------- | ----------- | ------------------------------------------------- |
| Node.js    | 18 LTS      | `brew install node` / `nvm install 18`            |
| Python     | 3.10+       | `brew install python@3.12`                        |
| MySQL      | 8.0         | `brew install mysql` / Docker                     |
| MetaMask   | latest      | Browser extension                                 |
| Git        | 2.x         | `brew install git`                                |
| Hardhat    | (npx)       | Installed via `npm install`                       |

### Optional but Recommended

- **Docker & Docker Compose** — for containerised MySQL and backend
- **Infura / Alchemy** account — for Sepolia RPC
- **Etherscan API key** — for contract verification

---

## 2. Repository Setup

```bash
git clone <repo-url> ezyvoting && cd ezyvoting

# Root dependencies (Hardhat, ethers, OpenZeppelin)
npm install

# Frontend dependencies
cd frontend && npm install && cd ..

# Backend dependencies
cd backend-flask
python3 -m venv venv
source venv/bin/activate          # macOS / Linux
pip install -r requirements.txt
cd ..
```

---

## 3. MySQL Database

### 3a. Start MySQL

```bash
# macOS (Homebrew)
brew services start mysql

# Docker alternative
docker run -d --name ezyvoting-db \
  -e MYSQL_ROOT_PASSWORD=changeme \
  -e MYSQL_DATABASE=ezyvoting \
  -p 3306:3306 \
  mysql:8.0
```

### 3b. Create Database & Schema

```bash
mysql -u root -p <<'SQL'
CREATE DATABASE IF NOT EXISTS ezyvoting
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
SQL

mysql -u root -p ezyvoting < database/schema.sql
```

This creates 8 tables (`users`, `voters`, `elections`, `candidates`,
`votes_metadata`, `results`, `audit_logs`, `sessions`) plus a default
admin user (`admin / admin123` — **change immediately**).

### 3c. Create Application User (recommended)

```sql
CREATE USER 'ezyvoting_app'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON ezyvoting.* TO 'ezyvoting_app'@'localhost';
FLUSH PRIVILEGES;
```

---

## 4. Smart Contract Compilation & Deployment

### 4a. Local Hardhat Network (development)

```bash
# Terminal 1 — start local chain
npx hardhat node

# Terminal 2 — deploy all contracts
npx hardhat run scripts/deploy-full.js --network localhost
```

Output:
```
VoterRegistry deployed to: 0x…
ElectionFactory deployed to: 0x…
VoteVerifier deployed to: 0x…
EzyVoting deployed to: 0x…
Contract addresses written to contract-addresses.json
Environment vars written to .env.contracts
```

### 4b. Run Tests

```bash
# Full test suite
npx hardhat test

# Commit-reveal tests only
npx hardhat test test/CommitReveal.test.js

# With gas report
REPORT_GAS=true npx hardhat test
```

### 4c. Verify on Etherscan (optional, after Sepolia deploy)

```bash
npx hardhat verify --network sepolia <VoterRegistry_address>
npx hardhat verify --network sepolia <ElectionFactory_address> <VoterRegistry_address>
npx hardhat verify --network sepolia <VoteVerifier_address> <VoterRegistry_address>
```

---

## 5. Flask Backend

### 5a. Configure Environment

```bash
cd backend-flask
cp .env.template .env
```

Edit `.env`:

```env
FLASK_ENV=development
SECRET_KEY=<generate-long-random-string>
JWT_SECRET_KEY=<another-random-string>

# MySQL
DATABASE_URL=mysql+pymysql://ezyvoting_app:<password>@localhost:3306/ezyvoting

# Blockchain
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
ADMIN_PRIVATE_KEY=<hardhat-account-0-private-key>

# Paste addresses from contract-addresses.json
VOTER_REGISTRY_ADDRESS=0x…
ELECTION_FACTORY_ADDRESS=0x…
VOTE_VERIFIER_ADDRESS=0x…
EZYVOTING_ADDRESS=0x…
```

### 5b. Run Development Server

```bash
source venv/bin/activate
python run.py
```

Backend starts on `http://localhost:5000`. Verify:

```bash
curl http://localhost:5000/api/blockchain/status
# → { "connected": true, "network": "hardhat", "block_number": … }
```

### 5c. Run with Gunicorn (production)

```bash
gunicorn -w 4 -b 0.0.0.0:5000 "app:create_app()"
```

---

## 6. Next.js Frontend

### 6a. Configure

Update `frontend/lib/ballotContract.js` constants if contract addresses
differ from defaults. The addresses are also read from
`/contract-addresses.json` by some utilities.

For Flask backend API calls, ensure the proxy or `NEXT_PUBLIC_API_URL`
variable points to `http://localhost:5000`.

### 6b. Run Development Server

```bash
cd frontend
npm run dev
```

Frontend starts on `http://localhost:3000`.

### 6c. Build for Production

```bash
npm run build
npm start            # production SSR server
```

Or deploy to Vercel (the repo already has `vercel.json`):

```bash
npx vercel --prod
```

---

## 7. Sepolia Testnet Deployment

### 7a. Prerequisites

1. Get Sepolia ETH from a faucet: https://sepoliafaucet.com
2. Create an Infura/Alchemy project → copy RPC URL
3. Export deployer private key from MetaMask

### 7b. Configure Hardhat

Ensure `hardhat.config.js` has:

```js
sepolia: {
  url: process.env.SEPOLIA_URL || "https://sepolia.infura.io/v3/<key>",
  accounts: [process.env.PRIVATE_KEY],
}
```

Create `.env` in project root:

```env
SEPOLIA_URL=https://sepolia.infura.io/v3/<your-key>
PRIVATE_KEY=0x<deployer-private-key>
ETHERSCAN_API_KEY=<optional>
```

### 7c. Deploy

```bash
npx hardhat run scripts/deploy-full.js --network sepolia
```

Update `.env` in `backend-flask/` with the new addresses and
`BLOCKCHAIN_RPC_URL=<sepolia-rpc>`.

Update frontend constants similarly.

---

## 8. Production Checklist

### Security

- [ ] Change default admin password (`admin123`)
- [ ] Set strong `SECRET_KEY` and `JWT_SECRET_KEY` (≥ 64 chars)
- [ ] Enable HTTPS everywhere (TLS 1.3)
- [ ] Set `FLASK_ENV=production` (disables debug)
- [ ] Review CORS origins — restrict to your domain
- [ ] Remove Hardhat default private keys
- [ ] Rate limiting tuned appropriately

### Database

- [ ] MySQL running with authentication
- [ ] Application user has minimal privileges
- [ ] Automated backups configured
- [ ] Connection pooling via SQLAlchemy pool settings

### Blockchain

- [ ] Contracts verified on Etherscan
- [ ] Admin wallet secured (hardware wallet for mainnet)
- [ ] Gas price strategy configured for production network
- [ ] Monitor contract events with a service (e.g., Alchemy webhooks)

### Infrastructure

- [ ] Backend behind reverse proxy (Nginx / Caddy)
- [ ] Frontend on CDN (Vercel / Cloudflare Pages)
- [ ] Logging to external service (e.g., Datadog, Sentry)
- [ ] Health check endpoints monitored
- [ ] Environment variables in secrets manager (not `.env` files)
- [ ] CI/CD pipeline for automated testing & deployment

### Monitoring

- [ ] Track gas usage per election
- [ ] Alert on failed transactions
- [ ] Dashboard for active elections & voter participation
- [ ] Audit log retention policy (≥ 1 year recommended)

---

## Quick Start (TL;DR)

```bash
# 1. Install everything
npm install && cd frontend && npm install && cd ../backend-flask && pip install -r requirements.txt && cd ..

# 2. Start MySQL + create DB
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS ezyvoting"
mysql -u root -p ezyvoting < database/schema.sql

# 3. Start local blockchain
npx hardhat node &

# 4. Deploy contracts
npx hardhat run scripts/deploy-full.js --network localhost

# 5. Start backend
cd backend-flask && cp .env.template .env && python run.py &

# 6. Start frontend
cd frontend && npm run dev
```

Open `http://localhost:3000` — connect MetaMask to `localhost:8545` (chain ID 31337).
