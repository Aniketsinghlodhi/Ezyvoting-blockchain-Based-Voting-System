# CI/CD Workflows for Automated Deployment

## GitHub Actions Workflow for Test & Deploy

Create file: `.github/workflows/deploy.yml`

```yaml
name: Test & Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  REGISTRY: ghcr.io
  BACKEND_IMAGE: ${{ github.repository }}/backend
  FRONTEND_IMAGE: ${{ github.repository }}/frontend

jobs:
  # ===========================
  # SMART CONTRACT TESTING
  # ===========================
  test-contracts:
    runs-on: ubuntu-latest
    if: |
      github.event_name == 'push' ||
      github.event_name == 'pull_request'

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18.x
          cache: 'npm'

      - name: Install dependencies
        run: npm install

      - name: Compile contracts
        run: npm run compile

      - name: Run tests
        run: npm test

      - name: Run security scan
        run: |
          pip install slither-analyzer
          slither contracts/EzyVoting.sol --json /tmp/slither-report.json || true

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  # ===========================
  # BACKEND TESTS
  # ===========================
  test-backend:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:6
        options: >-
          --health-cmd mongosh
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 27017:27017

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18.x
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install backend dependencies
        run: cd backend && npm install

      - name: Run linter
        run: cd backend && npm run lint || true

      - name: Run tests
        run: cd backend && npm test
        env:
          MONGO_URI: mongodb://localhost:27017/ezyvoting-test
          JWT_SECRET: test-secret

  # ===========================
  # FRONTEND TESTS
  # ===========================
  test-frontend:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18.x
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        run: cd frontend && npm install

      - name: Run linter
        run: cd frontend && npm run lint || true

      - name: Build
        run: cd frontend && npm run build
        env:
          NEXT_PUBLIC_CONTRACT_ADDRESS: 0x1234567890123456789012345678901234567890
          NEXT_PUBLIC_RPC_URL: https://sepolia.infura.io/v3/test
          NEXT_PUBLIC_API_URL: http://localhost:4000

  # ===========================
  # BUILD & PUBLISH IMAGES
  # ===========================
  build-and-push:
    needs: [test-contracts, test-backend, test-frontend]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Log in to Container Registry
        uses: docker/login-action@v2
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (backend)
        id: meta-backend
        uses: docker/metadata-action@v4
        with:
          images: ${{ env.REGISTRY }}/${{ env.BACKEND_IMAGE }}
          tags: |
            type=sha,prefix={{branch}}-
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push backend
        uses: docker/build-push-action@v4
        with:
          context: .
          file: ./backend/Dockerfile
          push: true
          tags: ${{ steps.meta-backend.outputs.tags }}
          labels: ${{ steps.meta-backend.outputs.labels }}
          cache-from: type=registry,ref=${{ env.REGISTRY }}/${{ env.BACKEND_IMAGE }}:buildcache
          cache-to: type=registry,ref=${{ env.REGISTRY }}/${{ env.BACKEND_IMAGE }}:buildcache,mode=max

      - name: Extract metadata (frontend)
        id: meta-frontend
        uses: docker/metadata-action@v4
        with:
          images: ${{ env.REGISTRY }}/${{ env.FRONTEND_IMAGE }}
          tags: |
            type=sha,prefix={{branch}}-
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push frontend
        uses: docker/build-push-action@v4
        with:
          context: .
          file: ./frontend/Dockerfile
          push: true
          tags: ${{ steps.meta-frontend.outputs.tags }}
          labels: ${{ steps.meta-frontend.outputs.labels }}
          cache-from: type=registry,ref=${{ env.REGISTRY }}/${{ env.FRONTEND_IMAGE }}:buildcache
          cache-to: type=registry,ref=${{ env.REGISTRY }}/${{ env.FRONTEND_IMAGE }}:buildcache,mode=max

  # ===========================
  # DEPLOY TO STAGING
  # ===========================
  deploy-staging:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    
    environment:
      name: staging

    steps:
      - uses: actions/checkout@v3

      - name: Deploy to Render
        run: |
          curl -X POST https://api.render.com/deploy/srv-${{ secrets.RENDER_SERVICE_ID }}?key=${{ secrets.RENDER_API_KEY }}

  # ===========================
  # DEPLOY TO PRODUCTION
  # ===========================
  deploy-production:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    environment:
      name: production
      url: https://yourdomain.com

    steps:
      - uses: actions/checkout@v3

      - name: Deploy smart contract
        run: |
          npm install
          npx hardhat run scripts/deploy-production.js --network sepolia
        env:
          SEPOLIA_PRIVATE_KEY: ${{ secrets.SEPOLIA_PRIVATE_KEY }}
          SEPOLIA_RPC_URL: ${{ secrets.SEPOLIA_RPC_URL }}
          ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}

      - name: Deploy backend to Railway
        run: |
          curl -X POST https://api.railway.app/graphql \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_TOKEN }}" \
            -d '{"query":"mutation { deploy(event_id: \"${{ github.event.deployment.id }}\") }"}'

      - name: Deploy frontend to Vercel
        run: |
          npx vercel \
            --prod \
            --token ${{ secrets.VERCEL_TOKEN }} \
            --env NEXT_PUBLIC_CONTRACT_ADDRESS=${{ secrets.CONTRACT_ADDRESS }} \
            --env NEXT_PUBLIC_API_URL=${{ secrets.API_URL }}

      - name: Verify deployment
        run: |
          curl -f https://yourdomain.com/health || exit 1
          curl -f https://api.yourdomain.com/health || exit 1

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Production deployment ${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*EzyVoting Production Deployment*\nStatus: ${{ job.status }}\nCommit: ${{ github.sha }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Smart Contract Deployment Workflow

Create file: `.github/workflows/deploy-contract.yml`

```yaml
name: Deploy Smart Contract

on:
  workflow_dispatch:
    inputs:
      network:
        description: 'Network to deploy to'
        required: true
        type: choice
        options:
          - sepolia
          - polygon
          - mainnet

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: ${{ github.event.inputs.network }}
    
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18.x
          cache: 'npm'

      - name: Install dependencies
        run: npm install

      - name: Compile contracts
        run: npm run compile

      - name: Run tests
        run: npm test

      - name: Deploy to ${{ github.event.inputs.network }}
        run: |
          npx hardhat run scripts/deploy-production.js --network ${{ github.event.inputs.network }}
        env:
          SEPOLIA_PRIVATE_KEY: ${{ secrets.SEPOLIA_PRIVATE_KEY }}
          SEPOLIA_RPC_URL: ${{ secrets.SEPOLIA_RPC_URL }}
          POLYGON_PRIVATE_KEY: ${{ secrets.POLYGON_PRIVATE_KEY }}
          POLYGON_RPC_URL: ${{ secrets.POLYGON_RPC_URL }}
          MAINNET_PRIVATE_KEY: ${{ secrets.MAINNET_PRIVATE_KEY }}
          MAINNET_RPC_URL: ${{ secrets.MAINNET_RPC_URL }}
          ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}
          POLYGONSCAN_API_KEY: ${{ secrets.POLYGONSCAN_API_KEY }}

      - name: Verify contract
        run: |
          npx hardhat run scripts/verify-production.js --network ${{ github.event.inputs.network }}
        env:
          ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}
          POLYGONSCAN_API_KEY: ${{ secrets.POLYGONSCAN_API_KEY }}

      - name: Export ABI
        run: npx hardhat run scripts/export-abi.js

      - name: Commit ABI and deployment info
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add deployments/ frontend/lib/abi/
          git commit -m "Deploy to ${{ github.event.inputs.network }}" || true
          git push

      - name: Notify deployment
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ Contract deployed to ${{ github.event.inputs.network }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Required GitHub Secrets

Configure in `Settings → Secrets and variables → Actions`:

```
# Blockchain
SEPOLIA_PRIVATE_KEY=                # Test deployment account
SEPOLIA_RPC_URL=https://...
POLYGON_PRIVATE_KEY=                # Production deployment account
POLYGON_RPC_URL=https://...
MAINNET_PRIVATE_KEY=                # Mainnet (if applicable)
MAINNET_RPC_URL=https://...

# API Keys
ETHERSCAN_API_KEY=                  # For contract verification
POLYGONSCAN_API_KEY=

# Environment Variables
CONTRACT_ADDRESS=0x...              # Deployed contract address
API_URL=https://api.yourdomain.com

# Deployment Tokens
RENDER_API_KEY=                     # For Render deployments
RENDER_SERVICE_ID=
RAILWAY_TOKEN=                      # For Railway deployments
VERCEL_TOKEN=                       # For Vercel deployments

# Notifications
SLACK_WEBHOOK=https://hooks.slack...
```

---

## Manual Deployment Commands

If prefer not using CI/CD:

```bash
# 1. Test everything locally
npm test
cd backend && npm test && cd ..
cd frontend && npm run build && cd ..

# 2. Deploy smart contract
npx hardhat run scripts/deploy-production.js --network sepolia

# 3. Verify contract
npx hardhat run scripts/verify-production.js --network sepolia

# 4. Export ABI to frontend
npx hardhat run scripts/export-abi.js

# 5. Deploy backend
cd backend
git push heroku main  # If using Heroku
# OR
railway deployment  # If using Railway

# 6. Deploy frontend
cd frontend
vercel --prod

# 7. Verify deployments
curl https://yourdomain.com
curl https://api.yourdomain.com/health
```

---

**Last Updated**: February 18, 2026
