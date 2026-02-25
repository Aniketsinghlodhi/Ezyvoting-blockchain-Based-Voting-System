-- ============================================================================
-- EzyVoting: MySQL Database Schema
-- Production-ready schema for off-chain metadata storage
-- All actual vote data lives on-chain; this stores metadata & audit trails.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS ezyvoting
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ezyvoting;

-- ─────────────────────────────────────────────────────────────
-- 1. USERS (Admin accounts)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255)    NOT NULL,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,
    role            ENUM('admin', 'super_admin') NOT NULL DEFAULT 'admin',
    wallet_address  VARCHAR(42)     UNIQUE,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_users_email (email),
    INDEX idx_users_wallet (wallet_address),
    INDEX idx_users_role (role)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────
-- 2. VOTERS (Off-chain voter metadata)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voters (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    name                    VARCHAR(255)    NOT NULL,
    identity_hash           VARCHAR(66)     NOT NULL UNIQUE COMMENT 'keccak256 of national ID',
    wallet_address          VARCHAR(42)     NOT NULL UNIQUE,
    constituency_id         INT             NOT NULL,
    is_registered_onchain   BOOLEAN         NOT NULL DEFAULT FALSE,
    tx_hash                 VARCHAR(66)     COMMENT 'On-chain registration tx hash',
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_voters_wallet (wallet_address),
    INDEX idx_voters_constituency (constituency_id),
    INDEX idx_voters_onchain (is_registered_onchain)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────
-- 3. ELECTIONS (Off-chain election metadata)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elections (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    onchain_id          INT             UNIQUE COMMENT 'ID from ElectionFactory contract',
    name                VARCHAR(255)    NOT NULL,
    description         TEXT,
    election_type       ENUM('general', 'constituency') NOT NULL DEFAULT 'general',
    constituency_id     INT             NOT NULL DEFAULT 0 COMMENT '0 = all constituencies',
    ballot_address      VARCHAR(42)     COMMENT 'Deployed Ballot contract address',
    commit_deadline     DATETIME        NOT NULL,
    reveal_deadline     DATETIME        NOT NULL,
    status              ENUM('pending', 'active', 'reveal', 'tallying', 'finalized', 'cancelled')
                            NOT NULL DEFAULT 'pending',
    created_by          INT             NOT NULL,
    tx_hash             VARCHAR(66)     COMMENT 'Election creation tx hash',
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_elections_creator FOREIGN KEY (created_by) REFERENCES users(id),

    INDEX idx_elections_status (status),
    INDEX idx_elections_ballot (ballot_address),
    INDEX idx_elections_dates (commit_deadline, reveal_deadline)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────
-- 4. CANDIDATES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    election_id     INT             NOT NULL,
    onchain_id      INT             COMMENT 'Candidate ID on Ballot contract',
    name            VARCHAR(255)    NOT NULL,
    party           VARCHAR(255)    DEFAULT 'Independent',
    description     TEXT,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_candidates_election FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,

    INDEX idx_candidates_election (election_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────
-- 5. VOTES_METADATA (Receipt tracking — NO vote content stored)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS votes_metadata (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    election_id     INT             NOT NULL,
    voter_address   VARCHAR(42)     NOT NULL,
    receipt_hash    VARCHAR(66)     NOT NULL COMMENT 'Commit receipt from Ballot contract',
    commit_tx_hash  VARCHAR(66)     COMMENT 'Commit transaction hash',
    reveal_tx_hash  VARCHAR(66)     COMMENT 'Reveal transaction hash',
    phase           ENUM('committed', 'revealed') NOT NULL DEFAULT 'committed',
    committed_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revealed_at     DATETIME,

    CONSTRAINT fk_votes_election FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
    CONSTRAINT uq_vote_election_voter UNIQUE (election_id, voter_address),

    INDEX idx_votes_voter (voter_address),
    INDEX idx_votes_phase (phase)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────
-- 6. RESULTS (Cached from blockchain after tally)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS results (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    election_id         INT             NOT NULL,
    candidate_id        INT             NOT NULL,
    candidate_name      VARCHAR(255)    NOT NULL,
    party               VARCHAR(255),
    vote_count          INT             NOT NULL DEFAULT 0,
    total_commits       INT             NOT NULL DEFAULT 0,
    total_reveals       INT             NOT NULL DEFAULT 0,
    is_winner           BOOLEAN         NOT NULL DEFAULT FALSE,
    synced_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_results_election FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,

    INDEX idx_results_election (election_id),
    INDEX idx_results_winner (is_winner)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────
-- 7. AUDIT_LOGS (Immutable administrative action trail)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT,
    action          VARCHAR(100)    NOT NULL,
    resource_type   VARCHAR(50),
    resource_id     INT,
    details         JSON,
    ip_address      VARCHAR(45),
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,

    INDEX idx_audit_action (action),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────
-- 8. SESSIONS (Optional: server-side session tracking)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT             NOT NULL,
    token_hash      VARCHAR(64)     NOT NULL UNIQUE COMMENT 'SHA-256 of JWT',
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(512),
    expires_at      DATETIME        NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_sessions_user (user_id),
    INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB;

-- ============================================================================
-- SEED DATA (for development/testing)
-- ============================================================================

INSERT INTO users (name, email, password_hash, role) VALUES
('Super Admin', 'admin@ezyvoting.com',
 '$2b$12$LJ3H4OvMEsS3g1H8YQ6EyeJHq1jR8J0z9UoO.NQfR4mK5MblkWEm6',  -- password: Admin123!
 'super_admin')
ON DUPLICATE KEY UPDATE name = name;
