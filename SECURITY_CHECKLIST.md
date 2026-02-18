# Security Checklist for Production Deployment

## Smart Contract Security

### Code-Level Security

- [ ] **No Reentrancy Vulnerabilities**
  - [ ] All external calls are last in function (checks-effects-interactions pattern)
  - [ ] Use OpenZeppelin's `ReentrancyGuard` for critical functions
  - Check: `function vote() ... nonReentrant { ... }`

- [ ] **No Integer Overflow/Underflow**
  - [ ] Using Solidity 0.8.0+ (has built-in overflow protection)
  - [ ] Or using SafeMath library for older versions
  - Check: `pragma solidity ^0.8.17;`

- [ ] **Proper Access Control**
  - [ ] Owner functions use `onlyOwner` modifier
  - [ ] Admin functions use `onlyAdmin` modifier
  - [ ] Public/private visibility correctly set
  - Check all state-changing functions are protected

- [ ] **No Hardcoded Values**
  - [ ] No hardcoded addresses in contract
  - [ ] Use constructor/initialization for critical values
  - [ ] Constants are uppercase: `uint256 constant MAX_VOTERS = 1000000;`

- [ ] **Events Properly Emitted**
  - [ ] All state changes emit events
  - [ ] Events indexed correctly for filtering
  - [ ] Events contain all relevant parameters
  - Check: `emit VoteCast(voter, electionId, candidateId);`

### Audit & Testing

- [ ] **Automated Security Scan**
  ```bash
  npm install -g slither-analyzer
  slither contracts/EzyVoting.sol
  ```
  Fix all critical/high-severity issues

- [ ] **Unit Tests**
  - [ ] Deploy test: deploys and initializes contract
  - [ ] Admin test: only admins can perform admin actions
  - [ ] Voter registration: voter data stored correctly
  - [ ] Voting test: voters can vote, can't vote twice
  - [ ] Results test: vote counts are correct
  - [ ] Edge cases: expired elections, invalid candidates

- [ ] **Integration Tests**
  - [ ] Full voting flow from registration to results
  - [ ] Multi-constituency voting
  - [ ] Gas usage acceptable
  - [ ] Contract state doesn't have exploitable gaps

- [ ] **Manual Code Review**
  - [ ] Reviewed by another developer
  - [ ] Logic is clear and matches requirements
  - [ ] No unused functions or variables
  - [ ] Comments explaining complex logic

### Deployment Configuration

- [ ] **Contract Constructor**
  ```solidity
  constructor() {
      owner = msg.sender;
      // Initialize any other state if needed
  }
  ```

- [ ] **Initialization Function (if needed)**
  - [ ] Callable only once
  - [ ] Uses `initializer` pattern or flag
  - [ ] Properly sets all initial state

- [ ] **Circuit Breaker Pattern**
  ```solidity
  bool public emergencyStop = false;
  
  modifier notEmergency() {
      require(!emergencyStop, "Emergency mode active");
      _;
  }
  
  function toggleEmergency() external onlyOwner {
      emergencyStop = !emergencyStop;
  }
  ```

---

## Blockchain Network Security

### Before Deployment

- [ ] **Choose Correct Network**
  - [ ] Using Sepolia for testnet (never mainnet for testing)
  - [ ] Using Polygon for production demo (low costs)
  - [ ] OR using Ethereum mainnet only if audited and funded
  - [ ] Have testnet ETH from faucet

- [ ] **RPC Endpoint Security**
  - [ ] Using trusted provider (Infura, Alchemy, Ankr)
  - [ ] Not exposing private RPC endpoints publicly
  - [ ] Rate limits on RPC calls configured
  - [ ] Fallback RPC endpoints configured if possible

- [ ] **Private Key Management**
  - [ ] Private key NOT in version control
  - [ ] Private key NOT in logs
  - [ ] Private key stored in environment variables only
  - [ ] Test key for testnet, separate key for mainnet
  - [ ] Regular key rotation planned

### After Deployment

- [ ] **Contract Verification**
  - [ ] Contract verified on Etherscan/Polygonscan
  - [ ] Source code matches deployed bytecode
  - [ ] Publicly viewable for audit

- [ ] **Monitor Transactions**
  - [ ] Check contract address on block explorer
  - [ ] Verify all deployed functions are callable
  - [ ] Monitor for suspicious transactions
  - [ ] Set up alerts for large transactions

---

## Backend Security

### Authentication & Authorization

- [ ] **JWT Token Security**
  ```javascript
  const JWT_SECRET = process.env.JWT_SECRET; // 32+ char random string
  const JWT_EXPIRY = '7d';
  
  // Generated: openssl rand -base64 32
  ```
  - [ ] Using HTTPS for all endpoints
  - [ ] Token not exposed in logs
  - [ ] Refresh token rotation implemented
  - [ ] Token expiry configured (7-30 days)

- [ ] **Password Hashing**
  ```javascript
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 12);
  ```
  - [ ] Using bcryptjs with salt rounds >= 10
  - [ ] Never storing plaintext passwords
  - [ ] Password validation on backend only

- [ ] **Session Management**
  - [ ] Sessions have expiry
  - [ ] Invalid tokens rejected
  - [ ] Logout invalidates token
  - [ ] Session data on server, not in token

### API Security

- [ ] **HTTPS/TLS**
  ```javascript
  // Enforce HTTPS only
  app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && !req.secure) {
      return res.redirect('https://' + req.headers.host + req.url);
    }
    next();
  });
  ```

- [ ] **CORS Configuration**
  ```javascript
  const cors = require('cors');
  app.use(cors({
    origin: ['https://yourdomain.com'],
    credentials: true,
    methods: ['GET', 'POST'],
  }));
  ```
  - [ ] Not using wildcard `*`
  - [ ] Specific domains whitelisted
  - [ ] Credentials allowed only from trusted sources

- [ ] **Rate Limiting**
  ```javascript
  const rateLimit = require('express-rate-limit');
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests',
  });
  app.use('/api/', limiter);
  ```
  - [ ] Applied to all API routes
  - [ ] Different limits for different endpoints
  - [ ] Redis-backed for distributed systems

- [ ] **Input Validation**
  ```javascript
  const { body, validationResult } = require('express-validator');
  
  app.post('/api/vote', [
    body('votes').isArray(),
    body('election_id').isInt({ min: 1 }),
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors });
  });
  ```

- [ ] **Security Headers**
  ```javascript
  const helmet = require('helmet');
  app.use(helmet());
  
  // Adds:
  // Content-Security-Policy
  // X-Content-Type-Options: nosniff
  // X-Frame-Options: DENY
  // Strict-Transport-Security
  ```

### Database Security

- [ ] **Database Credentials**
  - [ ] Using environment variables
  - [ ] Not in version control
  - [ ] Different credentials for prod/dev

- [ ] **MongoDB Security**
  - [ ] Authentication enabled
  - [ ] Strong password (32+ chars)
  - [ ] IP whitelist configured
  - [ ] Regular backups scheduled
  ```bash
  # MongoDB Atlas
  - Network Access: Specify IP ranges
  - Database Users: Strong password
  - Backup: Daily at 00:00 UTC
  ```

- [ ] **Data Protection**
  - [ ] Sensitive data encrypted at rest
  - [ ] Sensitive data encrypted in transit (TLS)
  - [ ] PII handling compliant with GDPR/privacy laws
  - [ ] Data retention policies implemented

- [ ] **SQL Injection Prevention**
  - [ ] Using parameterized queries (native to MongoDB)
  - [ ] Input validation before database queries
  - [ ] No string concatenation in queries

### Error Handling

- [ ] **Production Error Responses**
  ```javascript
  // DON'T expose internal details
  res.json({ error: 'Internal server error' });
  
  // DO log detailed errors
  logger.error('Vote processing failed', { error, userId });
  ```
  - [ ] Dev: detailed error messages in logs
  - [ ] Prod: generic error messages to clients
  - [ ] Stack traces hidden from users
  - [ ] Sensitive data not in error messages

- [ ] **Logging**
  ```javascript
  const winston = require('winston');
  
  logger.info('Vote cast', { userId, electionId, timestamp });
  logger.error('Database error', { error: err.message });
  ```
  - [ ] Structured logging (JSON format)
  - [ ] Log levels: debug, info, warn, error
  - [ ] Logs stored centrally (not on server)
  - [ ] No sensitive data in logs

### Deployment Security

- [ ] **Environment Configuration**
  - [ ] `.env` files in `.gitignore`
  - [ ] `.env.example` with placeholder values in repo
  - [ ] Separate `.env` files for each environment
  - [ ] No circular dependencies with sensitive data

- [ ] **API Keys**
  - [ ] Etherscan API key is read-only
  - [ ] MongoDB Atlas credentials limited to production DB
  - [ ] JWT secret is strong and unique
  - [ ] Regular key rotation (every 90 days)

---

## Frontend Security

### Code Security

- [ ] **No Private Keys Exposed**
  ```javascript
  // ❌ WRONG
  const PRIVATE_KEY = '0x...'; // NEVER!
  
  // ✅ CORRECT
  // Only connect to public RPC endpoints
  const RPC_URL = 'https://sepolia.infura.io/v3/KEY';
  ```

- [ ] **Contract Address Validation**
  ```javascript
  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error('Invalid contract address');
  }
  ```

- [ ] **No Hardcoded Secrets**
  - [ ] All sensitive variables from environment
  - [ ] `NEXT_PUBLIC_*` vars are OK (client-side)
  - [ ] Never public for sensitive data
  - Check: `NEXT_PUBLIC_API_URL` (OK), not `NEXT_PUBLIC_PRIVATE_KEY`

### Content Security Policy

```javascript
// next.config.js
module.exports = {
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.ethers.io",
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
      ],
    },
  ],
};
```

### Wallet Interaction Security

- [ ] **Validate Network**
  ```javascript
  const currentChainId = (await provider.getNetwork()).chainId;
  const expectedChainId = 11155111; // Sepolia
  
  if (currentChainId !== expectedChainId) {
    alert('Please switch to Sepolia network');
  }
  ```

- [ ] **Verify Contract Address**
  ```javascript
  // Before using contract
  const codeatAddress = await provider.getCode(CONTRACT_ADDRESS);
  if (codeatAddress === '0x') {
    throw new Error('No contract at this address');
  }
  ```

- [ ] **Handle User Rejections**
  ```javascript
  try {
    const tx = await contract.vote(...);
  } catch (error) {
    if (error.code === 'ACTION_REJECTED') {
      console.log('User rejected transaction');
    }
  }
  ```

### Dependencies Security

- [ ] **Audit Dependencies**
  ```bash
  npm audit
  npm audit fix
  npm update
  ```

- [ ] **No Vulnerable Packages**
  - [ ] Run `npm audit` before deployment
  - [ ] Fix all critical/high vulnerabilities
  - [ ] Whitelist acceptable risks only

---

## Infrastructure Security

### Hosting Security

- [ ] **HTTPS/TLS**
  - [ ] Valid SSL certificate
  - [ ] Certificate auto-renewal enabled
  - [ ] TLS 1.2+ enforced
  - [ ] HTTP redirects to HTTPS

- [ ] **DDoS Protection**
  - [ ] Using Cloudflare/AWS Shield
  - [ ] Rate limiting enabled
  - [ ] Bot protection enabled
  - [ ] WAF rules configured

- [ ] **Firewall Rules**
  - [ ] Only necessary ports open
  - [ ] SSH access from specific IPs only
  - [ ] Database access only from backend
  - [ ] No default credentials

### Monitoring & Alerting

- [ ] **Error Tracking**
  ```javascript
  const Sentry = require("@sentry/node");
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  ```
  - [ ] Setup Sentry/Rollbar
  - [ ] Alert on critical errors
  - [ ] Daily error reports reviewed

- [ ] **Uptime Monitoring**
  - [ ] Monitoring service configured
  - [ ] Health check every 5 minutes
  - [ ] SMS/email alerts on downtime
  - [ ] Status page for users

- [ ] **Performance Monitoring**
  - [ ] API response times tracked
  - [ ] Database query performance monitored
  - [ ] Alerts on performance degradation
  - [ ] Regular performance reports

- [ ] **Security Monitoring**
  - [ ] Failed login attempts tracked
  - [ ] Suspicious activity alerts
  - [ ] IP whitelist violations logged
  - [ ] Regular security log reviews

### Backup & Disaster Recovery

- [ ] **Database Backups**
  - [ ] Automated daily backups
  - [ ] Backups encrypted and stored offsite
  - [ ] Restore tested monthly
  - [ ] At least 7-day retention

- [ ] **Code Backups**
  - [ ] Git repository backed up
  - [ ] Multiple remote repositories
  - [ ] Deployment artifacts archived

---

## Operational Security

### Secrets Management

- [ ] **API Keys Rotation**
  - [ ] Etherscan key: every 6 months
  - [ ] MongoDB password: every 3 months
  - [ ] JWT secret: every 6 months
  - [ ] Private keys: changed after known compromises

- [ ] **Access Control**
  - [ ] Limited number of people with production access
  - [ ] Access logs maintained
  - [ ] Offboarding revokes access immediately
  - [ ] Regular access audits

### Deployment Process

- [ ] **Code Review Before Merge**
  - [ ] All changes reviewed by 2+ people
  - [ ] No direct mainnet deployments
  - [ ] Only from main/production branch
  - [ ] Deployment logs maintained

- [ ] **Change Management**
  - [ ] Change log updated
  - [ ] Deployment plan documented
  - [ ] Rollback plan ready
  - [ ] Team notified of changes

---

## Compliance & Legal

- [ ] **Privacy Policy**
  - [ ] Clear data collection statement
  - [ ] How user data is used
  - [ ] GDPR compliant (if EU users)
  - [ ] CCPA compliant (if CA users)

- [ ] **Terms of Service**
  - [ ] Limitations of liability
  - [ ] User responsibilities
  - [ ] Dispute resolution
  - [ ] Termination policy

- [ ] **Security Policy**
  - [ ] Bug bounty information (if applicable)
  - [ ] How to report security issues
  - [ ] Responsible disclosure timeline
  - [ ] Security contact email

---

## Pre-Launch Security Sign-Off

- [ ] **Technical Security Lead**: _______________  Date: _____
- [ ] **Smart Contract Auditor**: _______________  Date: _____
- [ ] **Backend Lead**: _______________  Date: _____
- [ ] **Frontend Lead**: _______________  Date: _____
- [ ] **DevOps/Infrastructure**: _______________  Date: _____

---

## Incident Response Plan

### Phase 1: Detection & Reporting
1. Team member discovers potential security issue
2. Report immediately to Security Lead
3. DO NOT post on public channels

### Phase 2: Assessment
1. Technical team assesses severity (P1/P2/P3/P4)
2. Determine if user data is at risk
3. Create incident ticket (private)

### Phase 3: Containment
- **P1** (Critical): Pause voting, enable emergency stop
- **P2** (High): Limit affected functionality
- **P3** (Medium): Document issue, plan fix
- **P4** (Low): Add to backlog, plan fix

### Phase 4: Eradication & Recovery
1. Fix the vulnerability
2. Update affected systems
3. Verify fix with tests
4. Deploy to production

### Phase 5: Post-Mortem
1. Document timeline of incident
2. Root cause analysis
3. Preventive measures identified
4. Team knowledge sharing

---

**Last Updated**: February 18, 2026  
**Review Date**: Every 90 days, or after any incident
