/**
 * docs/architecture.mermaid
 *
 * EzyVoting System Architecture — Mermaid diagram source.
 * Render with any Mermaid viewer (VS Code extension, GitHub, mermaid.live, etc.)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYSTEM ARCHITECTURE DIAGRAM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Paste the content below into https://mermaid.live or a .mmd file:

/*
graph TB
    subgraph "Frontend Layer (Next.js)"
        UI[React.js Pages]
        MW[MetaMask Wallet]
        BC[ballotContract.js]
        LC[contract.js - Legacy]
        AL[alerts.js]

        UI --> MW
        UI --> BC
        UI --> LC
        UI --> AL
    end

    subgraph "Backend Layer (Flask)"
        API[Flask REST API]
        JWT[JWT Auth Middleware]
        RL[Rate Limiter]
        RT_AUTH[Auth Routes]
        RT_ELEC[Election Routes]
        RT_VOT[Voter Routes]
        RT_BC[Blockchain Routes]
        SVC[Web3Service]

        API --> JWT
        API --> RL
        API --> RT_AUTH
        API --> RT_ELEC
        API --> RT_VOT
        API --> RT_BC
        RT_AUTH --> SVC
        RT_ELEC --> SVC
        RT_VOT --> SVC
        RT_BC --> SVC
    end

    subgraph "Blockchain Layer (Ethereum)"
        VR[VoterRegistry]
        EF[ElectionFactory]
        BL[Ballot Contracts]
        VV[VoteVerifier]
        EZ[EzyVoting - Legacy]

        EF --> BL
        EF --> VR
        BL --> VR
        VV --> VR
        VV --> BL
    end

    subgraph "Database Layer (MySQL)"
        DB[(MySQL Database)]
        T_USERS[users]
        T_VOTERS[voters]
        T_ELECTIONS[elections]
        T_CANDIDATES[candidates]
        T_VOTES[votes_metadata]
        T_RESULTS[results]
        T_AUDIT[audit_logs]

        DB --> T_USERS
        DB --> T_VOTERS
        DB --> T_ELECTIONS
        DB --> T_CANDIDATES
        DB --> T_VOTES
        DB --> T_RESULTS
        DB --> T_AUDIT
    end

    %% Connections between layers
    MW -->|"eth_sendTransaction"| VR
    MW -->|"commitVote / revealVote"| BL
    BC -->|"ethers.js read"| BL
    BC -->|"ethers.js read"| EF
    BC -->|"ethers.js read"| VV

    UI -->|"REST API"| API
    SVC -->|"Web3.py"| VR
    SVC -->|"Web3.py"| EF
    SVC -->|"Web3.py"| BL
    SVC -->|"Web3.py"| VV

    RT_AUTH --> DB
    RT_ELEC --> DB
    RT_VOT --> DB
    RT_BC --> DB

    style VR fill:#e8f5e9
    style EF fill:#e8f5e9
    style BL fill:#e8f5e9
    style VV fill:#e8f5e9
    style DB fill:#fff3e0
    style API fill:#e3f2fd
    style UI fill:#fce4ec
*/

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMIT-REVEAL VOTING FLOW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/*
sequenceDiagram
    participant V as Voter (Browser)
    participant MM as MetaMask
    participant B as Ballot Contract
    participant VR as VoterRegistry
    participant BE as Flask Backend

    Note over V,BE: ━━ COMMIT PHASE ━━

    V->>V: Select candidate (id=X)
    V->>V: Generate random secret (S)
    V->>V: Compute H = keccak256(X, S)
    V->>MM: Sign commitVote(H) tx
    MM->>B: commitVote(H)
    B->>VR: isEligible(voter)?
    VR-->>B: true
    B->>B: Store commit hash
    B->>B: Generate receipt hash (R)
    B-->>V: Event: VoteCommitted(voter, R)
    V->>V: SAVE secret S and receipt R locally
    V->>BE: POST /api/blockchain/vote/commit (receipt tracking)

    Note over V,BE: ━━ REVEAL PHASE ━━

    V->>MM: Sign revealVote(X, S) tx
    MM->>B: revealVote(X, S)
    B->>B: Verify keccak256(X, S) == stored hash
    B->>B: Increment candidate X vote count
    B-->>V: Event: VoteRevealed(voter)
    V->>BE: POST /api/blockchain/vote/reveal

    Note over V,BE: ━━ TALLY PHASE ━━

    V->>B: getResults()
    B-->>V: Candidate votes array
    V->>B: verifyReceipt(voter, R)
    B-->>V: true/false
*/

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONTRACT DEPLOYMENT DEPENDENCY GRAPH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/*
graph LR
    A[Deploy VoterRegistry] --> B[Deploy ElectionFactory]
    A --> C[Deploy VoteVerifier]
    B --> D[createElection]
    D --> E[Ballot Contract auto-deployed]
    A --> F[Deploy EzyVoting - Legacy]

    style A fill:#4CAF50,color:white
    style B fill:#2196F3,color:white
    style C fill:#FF9800,color:white
    style E fill:#9C27B0,color:white
    style F fill:#607D8B,color:white
*/
