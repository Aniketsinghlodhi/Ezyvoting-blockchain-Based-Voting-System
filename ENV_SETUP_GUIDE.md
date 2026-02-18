# Environment Variables Guide

## Root Directory (.env)

```env
# ============================================
# BLOCKCHAIN CONFIGURATION
# ============================================

# Private key of deployment account (KEEP SECRET!)
# Generate: https://metamask.io/ or ethers.js
PRIVATE_KEY=your_test_private_key_here_64_hex_chars

# Sepolia Testnet RPC
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY

# Polygon RPC (Alternative: cheaper for production)
POLYGON_RPC_URL=https://polygon-rpc.com

# Ethereum Mainnet RPC (Production - REAL MONEY)
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY

# Etherscan API Key (for contract verification)
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key

# ============================================
# DEPLOYMENT TARGETS
# ============================================

DEPLOYMENT_NETWORK=sepolia  # sepolia, polygon, or mainnet
CONTRACT_ADDRESS=0x...      # After deployment, update this
```

## Backend Directory (backend/.env.production)

```env
# ============================================
# SERVER CONFIGURATION
# ============================================

PORT=4000
NODE_ENV=production
LOG_LEVEL=info

# ============================================
# BLOCKCHAIN CONFIGURATION
# ============================================

# Contract details
CONTRACT_ADDRESS=0x_your_deployed_contract_address_
NETWORK=sepolia
RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY

# Optional: Private key if backend needs to send transactions
# WARNING: Only use read-only RPC endpoints without this!
# BACKEND_PRIVATE_KEY=

# ============================================
# DATABASE
# ============================================

# MongoDB Atlas production database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/ezyvoting-prod?retryWrites=true&w=majority

# Alternative: Self-hosted MongoDB
# MONGO_URI=mongodb://username:password@your-server:27017/ezyvoting-prod

# ============================================
# AUTHENTICATION & SECURITY
# ============================================

# JWT Secret (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your_very_long_random_secure_string_minimum_32_chars

# JWT Expiry
JWT_EXPIRY=7d
REFRESH_TOKEN_EXPIRY=30d

# Session secrets
SESSION_SECRET=another_random_secure_string

# ============================================
# EMAIL CONFIGURATION (Optional)
# ============================================

# Gmail SMTP settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_specific_password  # NOT your Gmail password!
SMTP_FROM=noreply@ezyvoting.app

# Alternative: SendGrid
# SENDGRID_API_KEY=

# ============================================
# RATE LIMITING & SECURITY
# ============================================

# Window in milliseconds (15 minutes)
RATE_LIMIT_WINDOW_MS=900000

# Max requests per window
RATE_LIMIT_MAX_REQUESTS=100

# Redis for distributed rate limiting (optional)
# REDIS_URL=redis://username:password@host:port

# ============================================
# CORS & DOMAINS
# ============================================

# Comma-separated list of allowed domains
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com

# ============================================
# MONITORING & LOGGING
# ============================================

# Sentry error tracking
SENTRY_DSN=https://your-sentry-dsn@sentry.io/12345

# LogRocket session replay (optional)
LOGROCKET_ID=your-logrocket-id

# ============================================
# ADMIN CREDENTIALS (Setup only)
# ============================================

# Initial admin invite code (change after first use!)
ADMIN_INVITE_CODE=INITIAL_ADMIN_CODE_123

# ============================================
# API KEYS
# ============================================

# If backend needs to call external APIs
ETHERSCAN_API_KEY=
ALCHEMY_API_KEY=
```

## Frontend Directory (frontend/.env.production.local)

```env
# ============================================
# SMART CONTRACT CONFIGURATION
# ============================================

# Contract address on blockchain
NEXT_PUBLIC_CONTRACT_ADDRESS=0x_your_deployed_contract_address_

# Network: sepolia, polygon, or mainnet
NEXT_PUBLIC_NETWORK=sepolia

# RPC endpoint (public, read-only)
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY

# Alternative RPC providers
# NEXT_PUBLIC_ALCHEMY_KEY=

# ============================================
# API CONFIGURATION
# ============================================

# Backend API URL
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# ============================================
# BLOCKCHAIN EXPLORER
# ============================================

# Etherscan URLs
NEXT_PUBLIC_ETHERSCAN_URL=https://sepolia.etherscan.io
NEXT_PUBLIC_ETHERSCAN_API_KEY=

# Polygonscan URLs (if using Polygon)
NEXT_PUBLIC_POLYGONSCAN_URL=https://polygonscan.com

# ============================================
# ANALYTICS (Optional)
# ============================================

# Google Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Hotjar session recording
NEXT_PUBLIC_HOTJAR_ID=

# ============================================
# FEATURE FLAGS
# ============================================

NEXT_PUBLIC_ENABLE_VOTING=true
NEXT_PUBLIC_ENABLE_RESULTS=true
NEXT_PUBLIC_MAINTENANCE_MODE=false

# ============================================
# APP METADATA
# ============================================

NEXT_PUBLIC_APP_NAME=EzyVoting
NEXT_PUBLIC_APP_VERSION=1.0.0
NEXT_PUBLIC_SUPPORT_EMAIL=support@yourdomain.com
```

---

## How to Generate Secure Values

### 1. Generate Private Key
```bash
# Using ethers.js
node -e "const ethers = require('ethers'); console.log(ethers.Wallet.createRandom().privateKey)"

# Using OpenSSL
openssl rand -hex 32

# Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Generate JWT Secret
```bash
# Using Node.js crypto
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -base64 32
```

### 3. Get API Keys

**Infura** (for RPC endpoints):
1. Sign up at https://infura.io
2. Create project
3. Copy Sepolia/Polygon RPC URL

**Etherscan** (for contract verification):
1. Sign up at https://etherscan.io
2. Go to API Keys
3. Create new API key

**MongoDB Atlas** (for database):
1. Sign up at https://cloud.mongodb.com
2. Create cluster
3. Get connection string

**SendGrid** (for emails):
1. Sign up at https://sendgrid.com
2. Create API key
3. Add to .env

---

## Security Rules

### ✅ DO
- [ ] Use strong, randomly generated secrets
- [ ] Store secrets in `.env` files (never commit)
- [ ] Use environment variables for all sensitive data
- [ ] Rotate secrets every 90 days
- [ ] Use different keys for dev/test/prod environments
- [ ] Keep backup of deployment private keys in secure vault

### ❌ DON'T
- [ ] Commit `.env` files to git
- [ ] Hardcode secrets in source code
- [ ] Use same secrets for multiple environments
- [ ] Share secrets via Slack/email
- [ ] Use weak passwords (< 12 characters)
- [ ] Log sensitive information
- [ ] Use mainnet private keys on testnet

---

## Deployment Environment Variables Checklist

**Before deploying, verify:**

```bash
# Check .env file exists
[ -f .env ] && echo "✅ Root .env exists" || echo "❌ Missing root .env"

# Check backend .env exists
[ -f backend/.env.production ] && echo "✅ Backend .env exists" || echo "❌ Missing backend .env"

# Check frontend .env exists  
[ -f frontend/.env.production.local ] && echo "✅ Frontend .env exists" || echo "❌ Missing frontend .env"

# Verify all required variables are set (no empty values)
grep -v "^#" .env | grep -v "^$" | grep "=$" && echo "❌ Found empty variables" || echo "✅ All variables set"
```

---

## Production Secrets Management Best Practices

### Option 1: GitHub Secrets (for CI/CD)
```yaml
# .github/workflows/deploy.yml
env:
  PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
  ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}
  MONGO_URI: ${{ secrets.MONGO_URI }}
```

### Option 2: Vercel Secrets (for frontend)
```bash
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS
vercel env add NEXT_PUBLIC_RPC_URL
```

### Option 3: Render Secrets (for backend)
Use Render dashboard → Environment tab → Add secrets

### Option 4: HashiCorp Vault (Enterprise)
For large deployments, use centralized secrets management.

---

**Last Updated**: February 18, 2026
