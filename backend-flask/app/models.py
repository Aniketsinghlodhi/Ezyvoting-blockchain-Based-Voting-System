from datetime import datetime
from . import db


class User(db.Model):
    """Admin users."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum("admin", "super_admin"), default="admin", nullable=False)
    wallet_address = db.Column(db.String(42), unique=True, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "wallet_address": self.wallet_address,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Voter(db.Model):
    """Registered voters with off-chain metadata."""

    __tablename__ = "voters"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False)
    identity_hash = db.Column(db.String(66), unique=True, nullable=False)
    wallet_address = db.Column(db.String(42), unique=True, nullable=False, index=True)
    constituency_id = db.Column(db.Integer, nullable=False)
    is_registered_onchain = db.Column(db.Boolean, default=False)
    tx_hash = db.Column(db.String(66), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "identity_hash": self.identity_hash,
            "wallet_address": self.wallet_address,
            "constituency_id": self.constituency_id,
            "is_registered_onchain": self.is_registered_onchain,
            "tx_hash": self.tx_hash,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Election(db.Model):
    """Off-chain election metadata."""

    __tablename__ = "elections"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    onchain_id = db.Column(db.Integer, unique=True, nullable=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    election_type = db.Column(db.Enum("general", "constituency"), default="general")
    constituency_id = db.Column(db.Integer, default=0)
    ballot_address = db.Column(db.String(42), nullable=True)
    commit_deadline = db.Column(db.DateTime, nullable=False)
    reveal_deadline = db.Column(db.DateTime, nullable=False)
    status = db.Column(
        db.Enum("pending", "active", "reveal", "tallying", "finalized", "cancelled"),
        default="pending",
    )
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    tx_hash = db.Column(db.String(66), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    candidates = db.relationship("Candidate", backref="election", lazy=True)
    creator = db.relationship("User", backref="elections_created")

    def to_dict(self):
        return {
            "id": self.id,
            "onchain_id": self.onchain_id,
            "name": self.name,
            "description": self.description,
            "election_type": self.election_type,
            "constituency_id": self.constituency_id,
            "ballot_address": self.ballot_address,
            "commit_deadline": self.commit_deadline.isoformat() if self.commit_deadline else None,
            "reveal_deadline": self.reveal_deadline.isoformat() if self.reveal_deadline else None,
            "status": self.status,
            "created_by": self.created_by,
            "tx_hash": self.tx_hash,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "candidates": [c.to_dict() for c in self.candidates],
        }


class Candidate(db.Model):
    """Candidates for elections."""

    __tablename__ = "candidates"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    election_id = db.Column(db.Integer, db.ForeignKey("elections.id"), nullable=False)
    onchain_id = db.Column(db.Integer, nullable=True)
    name = db.Column(db.String(255), nullable=False)
    party = db.Column(db.String(255), nullable=True)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "election_id": self.election_id,
            "onchain_id": self.onchain_id,
            "name": self.name,
            "party": self.party,
            "description": self.description,
        }


class VoteMetadata(db.Model):
    """Off-chain vote metadata (no vote content stored, only receipts)."""

    __tablename__ = "votes_metadata"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    election_id = db.Column(db.Integer, db.ForeignKey("elections.id"), nullable=False)
    voter_address = db.Column(db.String(42), nullable=False)
    receipt_hash = db.Column(db.String(66), nullable=False)
    commit_tx_hash = db.Column(db.String(66), nullable=True)
    reveal_tx_hash = db.Column(db.String(66), nullable=True)
    phase = db.Column(db.Enum("committed", "revealed"), default="committed")
    committed_at = db.Column(db.DateTime, default=datetime.utcnow)
    revealed_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.UniqueConstraint("election_id", "voter_address", name="uq_vote_election_voter"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "election_id": self.election_id,
            "voter_address": self.voter_address,
            "receipt_hash": self.receipt_hash,
            "phase": self.phase,
            "committed_at": self.committed_at.isoformat() if self.committed_at else None,
            "revealed_at": self.revealed_at.isoformat() if self.revealed_at else None,
        }


class Result(db.Model):
    """Cached election results (synced from blockchain after tally)."""

    __tablename__ = "results"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    election_id = db.Column(db.Integer, db.ForeignKey("elections.id"), nullable=False)
    candidate_id = db.Column(db.Integer, nullable=False)
    candidate_name = db.Column(db.String(255), nullable=False)
    party = db.Column(db.String(255), nullable=True)
    vote_count = db.Column(db.Integer, default=0)
    total_commits = db.Column(db.Integer, default=0)
    total_reveals = db.Column(db.Integer, default=0)
    is_winner = db.Column(db.Boolean, default=False)
    synced_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "election_id": self.election_id,
            "candidate_id": self.candidate_id,
            "candidate_name": self.candidate_name,
            "party": self.party,
            "vote_count": self.vote_count,
            "is_winner": self.is_winner,
        }


class AuditLog(db.Model):
    """Audit trail for all administrative actions."""

    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    action = db.Column(db.String(100), nullable=False)
    resource_type = db.Column(db.String(50), nullable=True)
    resource_id = db.Column(db.Integer, nullable=True)
    details = db.Column(db.JSON, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "details": self.details,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
