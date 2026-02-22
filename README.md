# EzyVoting — blockchainBasedVotingSystem

A full-stack blockchain-powered voting system built with Solidity, Hardhat, Express.js, MongoDB, and Next.js.

## Features

- ✓ Smart contract for secure, transparent voting (Solidity + Hardhat)
- ✓ JWT-based admin authentication with invite code protection
- ✓ Secure voter registration and login (off-chain + on-chain)
- ✓ MetaMask wallet integration for voting
- ✓ Voter dashboard with candidate listing and vote casting
- ✓ Admin dashboard for voter management and on-chain actions
- ✓ Demo seeding script for instant testing

## Project Structure

```
root/
├── contracts/          # Solidity smart contracts
├── scripts/            # Hardhat deploy, seed & verify scripts
├── test/               # Contract unit tests
├── backend/            # Express.js API (auth, DB, blockchain)
│   ├── src/
│   │   ├── index.js        # Server entry point
│   │   ├── middleware/     # JWT auth middleware
│   │   ├── models/         # Mongoose models (User, Voter)
│   │   ├── routes/         # API routes (auth, blockchain)
│   │   └── services/       # ethersService (contract interactions)
│   ├── .env.example
│   └── package.json
├── frontend/           # Next.js frontend
│   ├── pages/              # Next.js pages (admin, voter dashboards)
│   ├── components/         # Shared React components
│   ├── lib/                # Contract helpers, alerts utility
│   ├── .env.local.example
│   ├── vercel.json
│   └── package.json
├── hardhat.config.js
├── contract-address.json
└── package.json        # Root — Hardhat scripts
```

## Quick Start (Local Demo in ~5 minutes)

### 1. Install and compile contracts

```bash
npm install
npx hardhat compile
npx hardhat test
```

### 2. Start a local Hardhat node (terminal 1)

```bash
npx hardhat node
# Outputs 20 test accounts with private keys
```

### 3. Deploy contract to local network (terminal 2)

```bash
# From FRONTEND folder
npx hardhat run scripts/deploy.js --network localhost
# Note the contract address printed (e.g., 0x5FbDB2315678afccb...)
```

### 4. Seed demo data (constituencies, candidates, voters)

```bash
CONTRACT_ADDRESS=0x5FbDB2315678afccb... npx hardhat run scripts/seedDemo.js --network localhost
# Outputs demo voter addresses and IDs for testing
```

### 5. Start backend (terminal 3)

```bash
cd backend
npm install
# Create and configure .env (copy from .env.example)
cp .env.example .env
# Edit .env:
#   MONGO_URI=mongodb://localhost:27017/ezyvoting (or MongoDB Atlas)
#   JWT_SECRET=your-secret
#   ADMIN_INVITE_CODE=demo-invite-123
#   RPC_URL=http://127.0.0.1:8545 (local node)
#   PRIVATE_KEY=0x... (any account from `npx hardhat node`)
#   CONTRACT_ADDRESS=0x5FbDB2315678afccb...
npm run dev
```

### 6. Start frontend (terminal 4)

```bash
cd frontend
npm install
# Create and configure .env.local (copy from .env.local.example)
cp .env.local.example .env.local
# Edit .env.local:
#   NEXT_PUBLIC_CONTRACT_ADDRESS=0x5FbDB2315678afccb...
#   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
npm run dev
# Open http://localhost:3000
```

## Demo Flow (End-to-End Testing)

### Admin Setup

1. Go to http://localhost:3000/admin/register
   - Name: `Demo Admin`
   - Email: `admin@test.local`
   - Password: `test123`
   - Invite Code: `demo-invite-123`
   - **Register Admin** → saves JWT token

2. Go to http://localhost:3000/admin/dashboard
   - Click **Load Voters** → see sample voters registered by `seedDemo.js`
   - Click **Add Constituency (on-chain)** → test MetaMask integration
   - Use the **Register Voter** form to add more voters

### Voter Testing

1. From the seed script output, you have:
   - Voter 1: address = `0x70997970...` (from `npx hardhat node`), voter ID = `demo-voter-1`
   - Voter 2: address = `0x3c44cdddb...`, voter ID = `demo-voter-2`

2. **Import voter1's account into MetaMask:**
   - Open MetaMask → Settings → Import Account
   - Paste the private key from `npx hardhat node` output
   - Network: Localhost 8545 (already connected)

3. Go to http://localhost:3000/voter/login
   - Wallet Address: `0x70997970...` (voter1)
   - Click **Login** → saves JWT token

4. Go to http://localhost:3000/voter/dashboard
   - Click **Load Status** → shows registration status + candidates for voter's constituency
   - Voter ID: `demo-voter-1`
   - Click **Vote** on a candidate (e.g., Alice Kumar)
   - Confirm transaction in MetaMask
   - Vote is recorded on-chain ✓

5. Reload page → "You have voted" message appears (prevents re-voting)

## Deployment to Sepolia Testnet

### Prerequisites

1. **Infura Project** (for RPC endpoint):
   - Sign up at https://app.infura.io
   - Create a new project, select Sepolia network
   - Copy the Sepolia HTTPS endpoint (e.g., `https://sepolia.infura.io/v3/YOUR_KEY`)

2. **Test ETH for gas fees**:
   - Get from https://sepoliafaucet.com (requires Twitter/GitHub verification)
   - Or https://www.alchemy.com/faucets/ethereum-sepolia

3. **Etherscan API Key** (for contract verification):
   - Sign up at https://etherscan.io → API Keys
   - Create new key (name: "EzyVoting" or similar)
   - Copy the API key

### Step-by-Step Deployment

**Step 1: Configure environment**

```bash
# Copy and fill in backend/.env with Sepolia values
cp backend/.env.example backend/.env

# Edit backend/.env:
#   RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
#   PRIVATE_KEY=0xYOUR_SEPOLIA_TEST_WALLET_PRIVATE_KEY (hex format, no spaces)
#   ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY
#   MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/ezyvoting (or local)
#   CONTRACT_ADDRESS= (leave blank for now, will fill after deploy)
```

**Step 2: Deploy contract to Sepolia**

```bash
npx hardhat run scripts/deploy.js --network sepolia
# Output: Deployment successful! Contract Address: 0x...
# Automatically saves to deployed-address.txt
```

**Step 3: Verify contract on Etherscan (optional but recommended)**

```bash
# Set your contract address or let script read from deployed-address.txt
npx hardhat run scripts/verify.js --network sepolia

# Or use npm shortcut:
npm run verify:sepolia

# Once verified, you can view source code on:
# https://sepolia.etherscan.io/address/0xYOUR_CONTRACT_ADDRESS
```

**Step 4: Seed Sepolia with demo data (optional)**

```bash
CONTRACT_ADDRESS=$(cat deployed-address.txt) npm run seed:sepolia

# Outputs demo voter addresses and IDs for testing
```

**Step 5: Configure frontend for Sepolia**

```bash
# Edit frontend/.env.local:
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_ADDRESS
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY (optional)
```

**Step 6: Start services**

```bash
# Terminal 1: Backend
cd backend
npm run dev
# Listening on http://localhost:4000

# Terminal 2: Frontend
cd frontend
npm run dev
# Open http://localhost:3000
```

**Step 7: Test end-to-end flow (same as local demo)**

1. Admin registration at `/admin/register` with invite code `demo-invite-123`
2. Admin dashboard at `/admin/dashboard`
3. Voter login and voting at `/voter/dashboard`

All transactions now go to Sepolia testnet and are visible on:
- **Explorer**: https://sepolia.etherscan.io (search by address or tx hash)
- **Contract page**: https://sepolia.etherscan.io/address/0xYOUR_CONTRACT_ADDRESS

### Npm Convenience Scripts

```bash
# Deploy to Sepolia
npm run deploy:sepolia

# Verify contract on Etherscan
npm run verify:sepolia

# Seed Sepolia with demo data
npm run seed:sepolia

# Local alternatives
npm run deploy:localhost
npm run seed:localhost
```

### Sepolia Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `insufficient funds for gas` | Account has no test ETH | Get test ETH from faucet (check step 2 above) |
| `Invalid Infura key` | RPC_URL misconfigured | Double-check key in `.env` (no typos) |
| `Network error when making RPC request` | Network unreachable | Check internet connection, try Alchemy RPC as backup |
| `Already Verified` on etherscan | Contract verified previously | Use existing verification (safe to ignore) |
| `Constructor args mismatch` | Verification args don't match | EzyVoting has no constructor args, should work as-is |

### Etherscan Verification Details

Once verified on Etherscan, the contract source code becomes public and users can:
- Read and audit the contract code directly on Etherscan
- Interact with the contract via Etherscan's "Write Contract" tab (no MetaMask needed)
- See all transactions and state changes in real-time

Our `verify.js` script handles this automatically.

## API Endpoints (Backend)

### Auth

- `POST /api/auth/admin/register` — Register admin (requires invite code)
- `POST /api/auth/admin/login` — Admin login (returns JWT)
- `POST /api/auth/voter/register` — Register voter (admin-only, requires JWT)
- `POST /api/auth/voter/login` — Voter login (returns JWT)
- `GET /api/auth/me` — Get logged-in user profile (protected)
- `GET /api/auth/admin/voters` — List all voters (admin-only)

### Blockchain

- `POST /api/blockchain/register-voter` — Call smart contract `registerVoter`
- `POST /api/blockchain/register-candidate` — Call smart contract `registerCandidate`
- `POST /api/blockchain/start-election` — Call smart contract `startElection`
- `POST /api/blockchain/vote` — Call smart contract `vote`
- `GET /api/blockchain/results/:electionId` — Get election results

## Environment Variables

### Backend (`backend/.env`)

```
MONGO_URI=mongodb://localhost:27017/ezyvoting
JWT_SECRET=your-secret-key-here
PRIVATE_KEY=0xYOUR_TEST_WALLET_PRIVATE_KEY
RPC_URL=http://127.0.0.1:8545 (local) or https://sepolia.infura.io/v3/KEY (testnet)
CONTRACT_ADDRESS=0xDeployedContractAddress
ADMIN_INVITE_CODE=demo-invite-123
```

### Frontend (`frontend/.env.local`)

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xDeployedContractAddress
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 (optional, for read-only fallback)
```

## Security Notes

- ✓ Admin registration protected by invite code
- ✓ Voter registration requires JWT + admin role
- ✓ Smart contract uses role-based access control (owner, admin, voter)
- ✓ Voter IDs are hashed (keccak256) before on-chain storage
- ✓ Passwords never stored on blockchain
- ⚠️ Never commit `.env` files to source control
- ⚠️ Use test wallets only (Hardhat, Sepolia faucet) — never use production keys
- ⚠️ For production, implement proper identity verification and use battle-tested smart contract patterns

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| `Contract not found at address` | Contract address not deployed | Run `npx hardhat run scripts/deploy.js` first |
| `No provider available` | MetaMask not installed / RPC not set | Install MetaMask or set `NEXT_PUBLIC_RPC_URL` |
| `Invalid invite code` | Admin registration code mismatch | Check `ADMIN_INVITE_CODE` in `backend/.env` |
| `ID mismatch` on vote | Voter ID doesn't match on-chain hash | Ensure exact same string used on register and vote |
| `Already voted` | Voter tried to vote twice | Chain prevents double voting (expected behavior) |

## Production Deployment

### Frontend → Vercel

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub
2. Import **Ezyvoting-blockchain-Based-Voting-System**
3. Set **Root Directory** to `frontend`
4. Framework preset: **Next.js** (auto-detected)
5. Add environment variables:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` = your deployed contract address
   - `NEXT_PUBLIC_BACKEND_URL` = your backend URL (e.g., `https://ezyvoting-api.onrender.com`)
   - `NEXT_PUBLIC_RPC_URL` = Sepolia RPC (optional, MetaMask is used by default)
6. Click **Deploy** — auto-deploys on every push to `main`

### Backend → Render / Railway

1. Create a **Web Service** on [render.com](https://render.com) or [railway.app](https://railway.app)
2. Connect repo, set **Root Directory** to `backend`
3. Build command: `npm install`
4. Start command: `npm start`
5. Set environment variables from `backend/.env.example`
6. Required vars: `MONGO_URI`, `JWT_SECRET`, `RPC_URL`, `PRIVATE_KEY`, `CONTRACT_ADDRESS`, `ALLOWED_ORIGINS`
7. Set `ALLOWED_ORIGINS` to your Vercel frontend URL

### Smart Contract → Sepolia

```bash
# 1. Configure .env at root with RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY
npm run deploy:sepolia
# 2. Verify on Etherscan
npm run verify:sepolia
# 3. Seed demo data (optional)
npm run seed:sepolia
```

## Next Steps

- [x] Add Etherscan verification — `scripts/verify.js`
- [x] Add UI polish and accessibility features
- [x] Production-ready CORS and env config
- [ ] Implement rate limiting for sensitive endpoints
- [ ] Add comprehensive error logging and monitoring
- [ ] Integrate with real identity verification (optional)
- [ ] Write full integration tests

## Recent Enhancements

### UI/UX Improvements
- **Modern CSS styling** — CSS variables, responsive grid layouts, smooth transitions, better button states
- **Toast notifications** — Non-blocking alerts for success/error/warning messages (`frontend/lib/alerts.js`)
- **Loading states** — Visual feedback during blockchain transactions and API calls with spinner animation
- **Error handling** — User-friendly error messages instead of raw contract errors
- **Accessibility** — Semantic HTML, ARIA labels, keyboard navigation, proper heading hierarchy
- **Mobile responsive** — Grid adapts to mobile screens (cards, forms, buttons adjust)

### Etherscan Integration
- **Automated verification** — `scripts/verify.js` verifies contract source code on Etherscan
- **Npm shortcuts** — `npm run verify:sepolia` for quick verification
- **One-command deployment** — Full Sepolia flow: deploy → verify → seed → test

### Admin Dashboard Features
- **Voter management interface** — Register voters with form, load and display all registered voters
- **On-chain actions** — Add constituencies directly from dashboard
- **Protected endpoints** — All voter registration uses JWT + role-based access control

### Voter Dashboard Features  
- **Status display** — Shows registration status, voting status, constituency assignment
- **Candidate listing** — Displays all candidates for voter's constituency with vote counts
- **Vote confirmation** — Visual feedback during vote submission with loading states
- **Duplicate vote prevention** — UI prevents re-voting after first vote cast

