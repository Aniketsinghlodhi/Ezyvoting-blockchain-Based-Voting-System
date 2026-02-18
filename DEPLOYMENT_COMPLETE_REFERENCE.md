# Production Deployment: Complete Reference

**A comprehensive reference guide for deploying EzyVoting to production.**

---

## What You'll Need

### Accounts & Services (Free Tier Where Possible)

| Service | Purpose | Free Tier | URL |
|---------|---------|-----------|-----|
| GitHub | Version control | ✅ Yes | https://github.com |
| Infura | RPC endpoint | ✅ Yes (free tier) | https://infura.io |
| Etherscan | Contract verification | ✅ Yes | https://etherscan.io |
| MongoDB Atlas | Database | ✅ Yes (512MB) | https://cloud.mongodb.com |
| Render | Backend hosting | ✅ Yes (free tier) | https://render.com |
| Vercel | Frontend hosting | ✅ Yes (free tier) | https://vercel.com |
| Sentry | Error tracking | ✅ Yes (free tier) | https://sentry.io |

**Total Cost (First Year)**
- Domain name: $10-15/year
- Everythng else: FREE during development
- Production scale: $20-50/month (estimated)

---

## Step-by-Step Deployment Guide

### Phase 1: Preparation (Hours 1-4)

```bash
# 1. Setup GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOU/ezyvoting.git
git branch -M main
git push -u origin main

# 2. Create environment files
cp .env.example .env
cp backend/.env.example backend/.env.production
cp frontend/.env.example frontend/.env.production.local

# 3. Install dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 4. Test everything locally
npm test
cd backend && npm test && cd ..
cd frontend && npm run build && cd ..
```

### Phase 2: Blockchain Testnet (Hours 4-8)

```bash
# 1. Create Infura account → Get Sepolia RPC URL
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY

# 2. Get testnet ETH
# Visit: https://sepolia-faucet.pk910.de/

# 3. Deploy contract
npm run deploy:sepolia
# Expected output: "EzyVoting deployed to: 0x..."

# 4. Verify contract
npm run verify:sepolia

# 5. Export ABI
npx hardhat run scripts/export-abi.js

# 6. Save contract address
echo "NEXT_PUBLIC_CONTRACT_ADDRESS=0x..." >> frontend/.env.production.local
```

### Phase 3: Database (Hours 8-10)

```bash
# 1. Create MongoDB Atlas cluster
# Go to: https://cloud.mongodb.com
# - Create project
# - Build cluster (free tier)
# - Create user: "ezyvoting-prod"
# - Add IP whitelist
# - Copy connection string

# 2. Add to backend/.env.production
echo "MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/ezyvoting?retryWrites=true" >> backend/.env.production

# 3. Test connection
cd backend
node -e "require('mongoose').connect(process.env.MONGO_URI).then(() => console.log('Connected!')).catch(e => console.error(e))"
cd ..
```

### Phase 4: Backend Deployment (Hours 10-15)

**Option A: Render (Recommended)**

```bash
# 1. Create account: https://render.com
# 2. Connect GitHub
# 3. New Web Service
#    - Service name: "ezyvoting-backend"
#    - Environment: "Node"
#    - Build: "npm install"
#    - Start: "npm start"
# 4. Add environment variables in dashboard
# 5. Click "Deploy"

# After deployment, note the URL:
# https://ezyvoting-backend.onrender.com
```

**Option B: Railway**

```bash
# 1. Create account: https://railway.app
# 2. Connect GitHub
# 3. New project → Select repo
# 4. Add "Service" → Select source
# 5. Add environment variables
# 6. Deploy

# URL will be provided after deployment
```

### Phase 5: Frontend Deployment (Hours 15-18)

**Option: Vercel (Best for Next.js)**

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Add your production environment variables
cat frontend/.env.production.local

# 3. Deploy
cd frontend
vercel --prod --env-file .env.production.local
cd ..

# 4. Vercel will provide your domain
# https://yourdomain.vercel.app
```

### Phase 6: Testing (Hours 18-22)

```bash
# 1. Test health endpoints
curl https://api.yourdomain.com/health
curl https://yourdomain.vercel.app/api/health

# 2. Test complete voting flow
#    - Load https://yourdomain.vercel.app
#    - Connect MetaMask
#    - Register as voter
#    - Cast vote
#    - Check results

# 3. Check Etherscan
#    - Visit: https://sepolia.etherscan.io/address/0x...
#    - Verify transactions appear

# 4. Monitor error logs
#    - Backend logs
#    - Sentry error tracking
#    - Browser console
```

### Phase 7: Launch (Hour 22+)

```bash
# 1. Create custom domain (optional)
#    - Buy domain (GoDaddy, Namecheap, etc.)
#    - Add DNS records to Vercel & Render

# 2. Setup SSL/HTTPS (automatic with Vercel/Render)

# 3. Create status page (optional)
#    - Use: https://statuspage.io
#    - Link from website

# 4. Announce to users!
#    - Email
#    - Social media
#    - Documentation

# 5. Monitor closely for first 24 hours
#    - Check error logs frequently
#    - Test functionality
#    - Respond to user issues
```

---

## Architecture Overview

```
                    ┌─────────────┐
                    │  Users      │
                    │  (Browser)  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Vercel     │
                    │  (Frontend) │
                    │  Next.js    │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
      ┌─────▼────┐ ┌──────▼────┐ ┌──────▼────┐
      │  Render  │ │ Infura RPC│ │ Sentry    │
      │ (Backend)│ │Endpoint   │ │ (Errors)  │
      │ Express  │ │           │ │           │
      └─────┬────┘ └──────┬────┘ └───────────┘
            │             │
      ┌─────▼─────────────▼─────┐
      │                         │
      │   Ethereum Sepolia      │
      │   Smart Contract        │
      │   EzyVoting.sol         │
      │                         │
      └────────────────┬────────┘
                       │
      ┌────────────────▼─────────┐
      │  MongoDB Atlas Database  │
      │  (Voter data, logs)      │
      └──────────────────────────┘
```

---

## Configuration Files Quick Reference

### Root: .env
```env
PRIVATE_KEY=your_test_key
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/KEY
ETHERSCAN_API_KEY=your_key
DEPLOYMENT_NETWORK=sepolia
```

### Backend: .env.production
```env
PORT=4000
NODE_ENV=production
MONGO_URI=mongodb+srv://...
CONTRACT_ADDRESS=0x...
NETWORK=sepolia
RPC_URL=https://sepolia.infura.io/v3/KEY
JWT_SECRET=your_long_random_string
ALLOWED_ORIGINS=https://yourdomain.com
```

### Frontend: .env.production.local
```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/KEY
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## Common Issues & Solutions

### "Contract deployment failed"
```
❌ Problem: Low account balance
✅ Solution: Get testnet ETH from faucet
           https://sepolia-faucet.pk910.de/

❌ Problem: Wrong RPC URL
✅ Solution: Verify SEPOLIA_RPC_URL is set
           Check: npx hardhat accounts --network sepolia

❌ Problem: Private key format incorrect
✅ Solution: Should be 66 characters (0x + 64 hex digits)
```

### "Contract not found" in frontend
```
❌ Problem: Wrong contract address
✅ Solution: Copy from deployment output
           Update NEXT_PUBLIC_CONTRACT_ADDRESS

❌ Problem: Different network
✅ Solution: MetaMask must be on Sepolia
           Add network: https://chainlist.org/
```

### "MetaMask not found"
```
❌ Problem: MetaMask not installed
✅ Solution: Install from https://metamask.io

❌ Problem: Using wrong browser
✅ Solution: Try Chrome, Firefox, or Edge
```

### "API connection refused"
```
❌ Problem: Backend not running
✅ Solution: Check backend deployment status
           curl https://api.yourdomain.com/health

❌ Problem: CORS error
✅ Solution: Check ALLOWED_ORIGINS in backend .env
           Must include your frontend domain
```

### "Database connection failed"
```
❌ Problem: Wrong connection string
✅ Solution: Copy from MongoDB Atlas dashboard
           Format: mongodb+srv://user:pass@...

❌ Problem: IP not whitelisted
✅ Solution: Add your IP or 0.0.0.0/0 (development only)
           MongoDB Atlas → Network Access
```

---

## Commands Cheat Sheet

```bash
# Compile & Test (Root)
npm run compile
npm test

# Deploy Contract
npm run deploy:sepolia
npm run verify:sepolia

# Export ABI
npx hardhat run scripts/export-abi.js

# Backend
cd backend
npm install
npm run dev        # Development
npm start         # Production
npm test
npm run lint

# Frontend
cd frontend
npm install
npm run dev       # Development (localhost:3000)
npm run build     # Production build
npm start         # Production server
npm run lint

# Docker
docker-compose build
docker-compose up -d
docker-compose logs -f backend
docker-compose down
```

---

## Monitoring & Alerts

### Services to Setup

1. **Sentry** (Error tracking)
   ```
   1. Create account: https://sentry.io
   2. Create project
   3. Copy DSN
   4. Add to backend .env: SENTRY_DSN=
   ```

2. **Uptime Robot** (Monitoring)
   ```
   1. Create account: https://uptimerobot.com
   2. Monitor: https://yourdomain.com
   3. Monitor: https://api.yourdomain.com
   4. Set alerts for downtime
   ```

3. **Etherscan** (Contract monitoring)
   ```
   1. Visit: https://sepolia.etherscan.io/address/0x...
   2. Bookmark page
   3. Check for unusual activity
   4. Watch token transfers (if any)
   ```

---

## Security Checklist (Before Going Live)

- [ ] No `.env` files committed to git
- [ ] No private keys in any source files
- [ ] Contract verified on Etherscan
- [ ] HTTPS enforced on all endpoints
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Error messages don't expose system details
- [ ] Logs don't contain sensitive data
- [ ] Database backups configured
- [ ] Monitoring and alerts setup

---

## Post-Launch Checklist

- [ ] Monitor error logs daily (first week)
- [ ] Test voting flow multiple times
- [ ] Check blockchain explorer for transactions
- [ ] Collect user feedback
- [ ] Plan improvements based on feedback
- [ ] Setup automated backups (if not already)
- [ ] Create incident response plan
- [ ] Document lessons learned

---

## Performance Optimization Tips

### Frontend
```javascript
// Lazy load components
import dynamic from 'next/dynamic';
const VotingComponent = dynamic(() => import('../components/Vote'), { ssr: false });

// Optimize images
import Image from 'next/image';
<Image src="/logo.png" width={100} height={100} />

// Cache contract ABI
export const CONTRACT_ABI = /* ... */; // Constant, not fetched
```

### Backend
```javascript
// Cache contract instance
let contract = null;
function getContract() {
  if (!contract) {
    contract = new ethers.Contract(ADDRESS, ABI, provider);
  }
  return contract;
}

// Use database indexes
db.voters.createIndex({ address: 1 });
db.elections.createIndex({ id: 1 });
```

### Blockchain
```javascript
// Optimize contract calls
// Group reads: use multicall (batch requests)
// Use view/pure functions for readonly operations
// Store rarely-changing data off-chain
```

---

## Cost Estimation

### First Year Costs (Approximate)

| Item | Cost | Notes |
|------|------|-------|
| Domain | $12 | GoDaddy/Namecheap |
| Render/Railway | FREE | Free tier suitable for MVP |
| MongoDB | FREE | 512MB free tier |
| Vercel | FREE | Free tier suitable for MVP |
| Infura | FREE | Rate-limited free tier |
| Sentry | FREE | Free tier for small apps |
| **Total** | **~$12** | Can scale to $50-100/mo if popular |

### Running Costs (At Scale)

| Item | Cost | When |
|------|------|------|
| Backend (2GB RAM) | $14/mo | 1000+ users |
| Database (backup) | $10/mo | With redundancy |
| RPC endpoints | $29/mo | High transaction volume |
| Frontend CDN | FREE-$20/mo | With caching |
| Domain | $12/year | Every year |
| Monitoring | FREE-$20/mo | Advanced features |

---

## Version Control Guidelines

### Branch Strategy
```
main              (production - tagged releases)
├─ develop        (staging - next release)
│  ├─ feature/    (new features)
│  ├─ bugfix/     (bug fixes)
│  └─ hotfix/     (critical fixes)
```

### Commit Message Format
```
[type] Brief description

- Change 1
- Change 2

Fixes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## Important URLs to Save

After deployment, bookmark these:

```
Smart Contract (Sepolia):
https://sepolia.etherscan.io/address/0x...

Frontend:
https://yourdomain.vercel.app
https://yourdomain.com (if custom domain)

Backend API:
https://api.yourdomain.onrender.com
https://api.yourdomain.com (if custom domain)

Database:
MongoDB Atlas Console

Monitoring:
Sentry: https://sentry.io/
Uptime Robot: https://uptimerobot.com/
```

---

## Next Level: Mainnet Deployment

When ready for real Ethereum (requires audit + funding):

```bash
# 1. Get mainnet ETH (not free!)
# Buy from exchange: Coinbase, Kraken, etc.

# 2. Deploy to mainnet
export MAINNET_PRIVATE_KEY=your_key
export MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
npx hardhat run scripts/deploy-production.js --network mainnet

# 3. Verify contract
npx hardhat run scripts/verify-production.js --network mainnet

# 4. Update frontend
NEXT_PUBLIC_NETWORK=mainnet

# ⚠️ WARNING: Real money involved!
# Make sure you've tested thoroughly on testnet first
```

---

## Getting Help

### Documentation
- Hardhat: https://hardhat.org/docs
- ethers.js: https://docs.ethers.org
- Next.js: https://nextjs.org/docs
- Express: https://expressjs.com
- MongoDB: https://docs.mongodb.com

### Communities
- Ethereum Dev Discord: https://discord.gg/ethereum
- Stack Exchange: https://ethereum.stackexchange.com
- Reddit: r/ethereum, r/solidity

### Support
- GitHub Issues: Your repository
- Email: Your support email
- Community Forums

---

## Final Thoughts

✅ **You've got this!** Deploying a blockchain DApp is challenging, but follow this guide step-by-step and you'll have a production-ready voting system.

**Key Success Factors:**
1. Test thoroughly before each phase
2. Don't rush - follow the timeline
3. Keep security in mind always
4. Monitor closely after launch
5. Document everything
6. Ask for help when stuck

**Good luck! 🚀**

---

**Last Updated**: February 18, 2026  
**Version**: 1.0.0  
**Status**: Tested & Production Ready
