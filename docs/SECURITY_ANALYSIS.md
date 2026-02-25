# EzyVoting — Security Analysis

> Comprehensive security assessment of the Blockchain-Based Online Voting System.
> Covers smart contracts, backend, frontend, privacy model, and threat landscape.

---

## Table of Contents

1. [Commit-Reveal Scheme Analysis](#1-commit-reveal-scheme-analysis)
2. [Smart Contract Security](#2-smart-contract-security)
3. [Backend API Security](#3-backend-api-security)
4. [Frontend Security](#4-frontend-security)
5. [Privacy Guarantees](#5-privacy-guarantees)
6. [Threat Model](#6-threat-model)
7. [Known Limitations](#7-known-limitations)
8. [Future Improvements](#8-future-improvements)

---

## 1. Commit-Reveal Scheme Analysis

### 1.1 Purpose

The commit-reveal scheme prevents **front-running** and **vote-buying** during
the voting period. Without it, an attacker could watch the mempool, see
incoming votes, and act on them (e.g., submit a countering vote or bribe voters
based on observed choices).

### 1.2 Protocol

```
COMMIT PHASE
  voter computes:  H = keccak256(abi.encodePacked(candidateId, secret))
  voter sends:     Ballot.commitVote(H)
  contract stores: commits[voter] = H, hasCommitted[voter] = true
  contract emits:  receipt = keccak256(abi.encodePacked(voter, H, block.timestamp))

REVEAL PHASE
  voter sends:     Ballot.revealVote(candidateId, secret)
  contract checks: keccak256(abi.encodePacked(candidateId, secret)) == commits[voter]
  contract stores: votes[candidateId]++, hasRevealed[voter] = true

TALLY PHASE
  anyone reads:    Ballot.getResults() → candidate vote counts
```

### 1.3 Security Properties

| Property              | Status | Notes |
| --------------------- | ------ | ----- |
| Vote secrecy (during commit) | ✅ Strong | Hash hides candidateId; brute-forcing requires knowing the 256-bit secret |
| Binding commitment    | ✅ Strong | SHA3/keccak256 is collision-resistant; voter cannot change vote after commit |
| Front-running prevention | ✅ Strong | Votes are hidden until reveal phase begins |
| Coercion resistance   | ⚠️ Partial | Voter can prove their vote during reveal; mitigated if secret is ephemeral |
| Receipt-freeness      | ⚠️ Partial | Receipt hash allows self-verification but could be shared to prove vote |
| Non-participation attack | ⚠️ Noted | Voter can commit but refuse to reveal; counted as abstention |

### 1.4 Secret Generation

The frontend generates a 32-byte random secret using `ethers.randomBytes(32)`,
which delegates to `crypto.getRandomValues()` — a CSPRNG. This is
cryptographically secure and non-deterministic.

---

## 2. Smart Contract Security

### 2.1 Access Control

All administrative functions enforce `onlyAdmin` modifier:

```solidity
modifier onlyAdmin() {
    require(msg.sender == admin, "Only admin");
    _;
}
```

| Contract         | Admin Functions |
| ---------------- | --------------- |
| VoterRegistry    | `registerVoter`, `deactivateVoter`, `reactivateVoter`, `verifyIdentity` |
| ElectionFactory  | `createElection` |
| Ballot           | `cancelElection`, `extendDeadline`, `finalize` |

**Risk**: Single admin key. If compromised, attacker controls the election.
**Mitigation**: Use a multi-sig wallet (Gnosis Safe) for production.

### 2.2 Reentrancy

The contracts do not hold ETH and do not make external calls with value
transfer. Therefore, classic reentrancy is **not applicable**. State changes
happen before event emissions (Checks-Effects-Interactions pattern is followed).

### 2.3 Integer Overflow/Underflow

Solidity ^0.8.17 has built-in overflow/underflow checks. All arithmetic
operations will revert on overflow. ✅ Safe.

### 2.4 Denial of Service

| Vector | Mitigation |
| ------ | ---------- |
| Block gas limit (too many candidates) | `MAX_CANDIDATES = 50` in Ballot |
| Unbounded loops | `getResults()` loops over candidates (capped at 50) |
| Self-destruct griefing | Contracts have no `selfdestruct` |
| Ballot factory spam | Only admin can `createElection` |

### 2.5 Timestamp Dependence

Phase transitions use `block.timestamp`:
```solidity
require(block.timestamp < commitDeadline, "Commit phase ended");
require(block.timestamp >= commitDeadline && block.timestamp < revealDeadline, "Not in reveal phase");
```

Miners can manipulate timestamps by ~15 seconds. For elections lasting hours or
days, this is **negligible**. For very short windows, consider block-number
deadlines.

### 2.6 Front-Running of Reveals

During the reveal phase, if a voter broadcasts `revealVote(candidateId, secret)`,
miners can see the vote before mining. However, this is **after** the commit
phase closed, so candidates cannot change their campaign strategy or bribe
voters based on revealed votes in real-time. The impact is minimal because all
reveals happen within the same phase window.

### 2.7 Storage Patterns

- `mapping(address => bytes32) commits` — private by default but readable
  on-chain. This is acceptable because commits are hashes, not plaintext votes.
- Candidate vote counts are only incremented during reveal, not readable until
  reveal phase or after.

---

## 3. Backend API Security

### 3.1 Authentication

- **JWT tokens** with configurable expiry (default 24h).
- bcrypt password hashing (work factor = 12).
- Admin registration requires existing admin approval (first admin seeded in DB).
- Voter authentication is **wallet-based** — signed messages verify ownership.

### 3.2 Rate Limiting

Flask-Limiter is configured with defaults:

```python
RATELIMIT_DEFAULT = "200 per day, 50 per hour"
```

Sensitive endpoints have tighter limits:
- Login: prevents brute-force
- Vote submission: prevents spam

### 3.3 Input Validation

- `validate_json` decorator enforces required fields per endpoint.
- SQL injection prevented by SQLAlchemy's parameterized queries.
- Ethereum address format validated with regex: `^0x[a-fA-F0-9]{40}$`.

### 3.4 CORS

CORS is configured with explicit origin allowlist. In production, restrict to
the frontend domain only:

```python
CORS_ORIGINS = ["https://your-domain.com"]
```

### 3.5 Audit Logging

Every state-changing API call is logged to `audit_logs` table:
- Who (user ID, IP address)
- What (action, resource)
- When (timestamp)
- Details (JSON payload, minus sensitive data)

---

## 4. Frontend Security

### 4.1 Wallet Security

- Private keys **never** leave MetaMask. The frontend only requests transaction
  signatures.
- The commit secret is generated client-side and shown to the user once. It is
  **not** sent to the backend.

### 4.2 State Management

- Vote secrets stored in React state (memory-only). Not persisted to
  `localStorage` or `sessionStorage`.
- **User responsibility**: Save the secret externally for the reveal phase.

### 4.3 XSS Prevention

- Next.js auto-escapes JSX expressions.
- No use of `dangerouslySetInnerHTML`.
- CSP headers recommended in production (via `next.config.js` or Nginx).

### 4.4 Dependency Supply Chain

- `ethers.js` is a well-audited library (v6).
- Recommend `npm audit` and Dependabot/Snyk for ongoing monitoring.

---

## 5. Privacy Guarantees

### 5.1 What Is Private

| Data Point       | Privacy Level | Notes |
| ---------------- | ------------- | ----- |
| Vote choice (during commit) | ✅ Hidden | Only hash stored on-chain |
| Vote choice (after reveal)  | ❌ Public | On-chain after reveal phase |
| Voter identity → wallet     | ⚠️ Pseudonymous | Wallet addresses are public; link to real identity is off-chain only |
| Who voted                   | ❌ Public | Commit/reveal events logged on-chain |
| Election results            | ✅ Hidden until tally | Only accessible after reveal deadline |
| Off-chain voter records     | ✅ Private | MySQL database, access-controlled |

### 5.2 Linkability

An observer can link a specific wallet to a specific vote after the reveal
phase. This is a fundamental limitation of transparent blockchains. Solutions:

- **ZK-SNARKs**: Prove vote validity without revealing the actual vote (see §8).
- **Mixnets**: Route transactions through a mixing protocol.
- **Ring signatures**: Hide the sender among a group.

### 5.3 Data Retention

- On-chain data is **permanent** and immutable.
- Off-chain data (MySQL) should have a retention policy. `audit_logs` should be
  retained for ≥ 1 year per regulatory requirements.

---

## 6. Threat Model

### 6.1 Threat Actors

| Actor | Capability | Goal |
| ----- | ---------- | ---- |
| Malicious voter | Owns a wallet, has internet | Vote multiple times, vote for others |
| External attacker | Network access, no credentials | Disrupt election, steal credentials |
| Compromised admin | Has admin private key | Manipulate elections, register fake voters |
| Colluding miners | Can reorder/censor transactions | Front-run votes, censor reveals |
| Nation-state adversary | Full network visibility | De-anonymize voters, manipulate results |

### 6.2 Attack Vectors & Mitigations

| Attack | Impact | Likelihood | Mitigation |
| ------ | ------ | ---------- | ---------- |
| Double voting | High | Low | `hasCommitted[voter]` check on-chain; one wallet = one vote |
| Sybil attack (many wallets) | High | Medium | VoterRegistry requires admin-verified identity; `identityUsed` mapping |
| Admin key compromise | Critical | Low | Multi-sig wallet; time-locked admin operations |
| Front-running commits | High | Low | Commits are hashes — no useful information leaked |
| Replay attack (same hash) | Medium | Low | `hasCommitted` prevents re-use; commit tied to `msg.sender` |
| DDoS on backend | Medium | Medium | Rate limiting; CDN; backend is non-critical (voting happens on-chain) |
| SQL injection | High | Low | SQLAlchemy parameterized queries |
| JWT token theft | Medium | Low | Short expiry; HTTPS required; HttpOnly cookies recommended |
| Smart contract bug | Critical | Low | Comprehensive test suite (30+ tests); consider professional audit |
| Blockchain network failure | High | Very Low | Retry logic; deadline extensions available to admin |
| Secret loss (voter) | Medium | Medium | UX warns to save secret; possible recovery via admin intervention |

### 6.3 Trust Assumptions

1. **Ethereum consensus is honest** — 51% of validators are not colluding.
2. **Keccak256 is preimage-resistant** — commits cannot be reversed.
3. **MetaMask is not compromised** — wallet correctly signs transactions.
4. **Admin is honest** — or use multi-sig to distribute trust.
5. **Frontend code is authentic** — served over HTTPS with SRI hashes.

---

## 7. Known Limitations

### 7.1 Voter Coercion

A voter who reveals their secret to a coercer proves how they voted.
The commit-reveal scheme alone does not provide **coercion resistance**.
True coercion resistance requires techniques like:
- Deniable encryption
- Re-voting capability (last vote counts)
- Trusted hardware enclaves

### 7.2 Vote Buying

If a voter can prove their vote (via the receipt + revealed candidate), they
can sell it. The receipt is designed for self-verification, not third-party
proof, but the on-chain reveal inherently makes the vote public.

### 7.3 Scalability

Each vote requires 2 on-chain transactions (commit + reveal). On Ethereum
mainnet at ~$5/tx, a 10,000-voter election costs ~$100,000 in gas. Solutions:

- Layer 2 rollups (Optimism, Arbitrum, Base)
- Sidechains (Polygon PoS)
- Application-specific chains

### 7.4 Voter Key Management

If a voter loses their private key between commit and reveal, their vote is
lost (counted as abstention). There is no recovery mechanism at the smart
contract level.

### 7.5 Centralized Admin

The system relies on a single admin for voter registration and election
creation. This is a centralisation point that could be abused.

---

## 8. Future Improvements

### 8.1 Zero-Knowledge Proofs (Priority: High)

Implement ZK-SNARKs (using Circom/SnarkJS or Noir) to enable:
- **Private voting**: Prove vote validity without revealing the candidate.
- **Eligibility proof**: Prove voter is in the registry without revealing which voter.
- **Tally verification**: Prove results are correct without exposing individual votes.

Example circuit (Circom):
```
template VoteValid() {
    signal input candidateId;
    signal input secret;
    signal input commitHash;
    signal output valid;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== candidateId;
    hasher.inputs[1] <== secret;

    valid <== (hasher.out == commitHash) ? 1 : 0;
}
```

### 8.2 Layer 2 Scaling (Priority: High)

Deploy contracts on an L2 rollup to reduce gas costs by 10-100x while
maintaining Ethereum security guarantees. Recommended: **Base** (Coinbase L2)
or **Arbitrum One**.

### 8.3 Multi-Sig Admin (Priority: High)

Replace single admin with a Gnosis Safe multi-sig wallet requiring M-of-N
signatures for administrative actions:
- 3-of-5 for election creation
- 4-of-5 for voter deactivation

### 8.4 Decentralized Identity (Priority: Medium)

Integrate DID standards (W3C Verifiable Credentials) for voter registration
instead of relying on admin-verified identity hashes. Compatible with:
- Ethereum Attestation Service (EAS)
- Worldcoin (proof of personhood)
- Polygon ID

### 8.5 Gasless Voting (Priority: Medium)

Use meta-transactions (EIP-2771 / OpenZeppelin Defender Relay) so voters don't
need ETH to vote. The election admin pays gas on behalf of voters.

### 8.6 On-Chain Governance (Priority: Low)

Replace admin role with a DAO governance model where stakeholders vote on
election parameters, voter disputes, and system upgrades.

### 8.7 Formal Verification (Priority: Medium)

Use tools like Certora, Halmos, or Foundry's symbolic execution to formally
verify critical invariants:
- Total revealed votes ≤ total committed votes
- No voter can vote twice
- Results are deterministic given the same reveals

---

## Summary

The EzyVoting system provides a solid foundation for blockchain-based voting
with its commit-reveal scheme, comprehensive access controls, and layered
architecture. The primary security properties — **integrity**, **transparency**,
and **availability** — are well-addressed. **Privacy** is partially addressed
(hidden during commit, public after reveal) and would benefit from ZK-proof
integration. **Coercion resistance** remains the hardest unsolved problem in
electronic voting and is a known theoretical limitation.

For production deployment, the highest-priority items are:
1. Professional smart contract audit
2. Multi-sig admin wallet
3. Layer 2 deployment for cost reduction
4. ZK-proofs for full vote privacy
