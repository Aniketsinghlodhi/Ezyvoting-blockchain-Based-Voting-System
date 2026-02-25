"""
Authentication routes: admin registration, login, and voter login.
Implements JWT-based authentication with bcrypt password hashing.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from flask_limiter import Limiter
import bcrypt

from .. import db, limiter
from ..models import User, Voter, AuditLog
from ..middleware import jwt_required_custom, admin_required, validate_json, log_audit
from ..config import Config

auth_bp = Blueprint("auth", __name__)


# ──────────────────── ADMIN REGISTRATION ────────────────────

@auth_bp.route("/admin/register", methods=["POST"])
@limiter.limit("5/minute")
@validate_json("name", "email", "password", "inviteCode")
def admin_register():
    """Register a new admin using an invite code."""
    data = request.get_json()

    if data["inviteCode"] != Config.ADMIN_INVITE_CODE:
        return jsonify({"ok": False, "error": "Invalid invite code"}), 403

    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"ok": False, "error": "Email already registered"}), 409

    password_hash = bcrypt.hashpw(
        data["password"].encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")

    user = User(
        name=data["name"],
        email=data["email"],
        password_hash=password_hash,
        role="admin",
        wallet_address=data.get("walletAddress"),
    )
    db.session.add(user)
    db.session.commit()

    log_audit("admin_registered", "user", user.id, {"email": user.email})

    token = create_access_token(identity=user.id)
    return jsonify({
        "ok": True,
        "token": token,
        "user": user.to_dict(),
    }), 201


# ──────────────────── ADMIN LOGIN ────────────────────

@auth_bp.route("/admin/login", methods=["POST"])
@limiter.limit("10/minute")
@validate_json("email", "password")
def admin_login():
    """Authenticate an admin and return a JWT."""
    data = request.get_json()

    user = User.query.filter_by(email=data["email"]).first()
    if not user or not user.is_active:
        return jsonify({"ok": False, "error": "Invalid credentials"}), 401

    if not bcrypt.checkpw(data["password"].encode("utf-8"), user.password_hash.encode("utf-8")):
        return jsonify({"ok": False, "error": "Invalid credentials"}), 401

    log_audit("admin_login", "user", user.id)

    token = create_access_token(identity=user.id)
    return jsonify({
        "ok": True,
        "token": token,
        "user": user.to_dict(),
    })


# ──────────────────── VOTER LOGIN (wallet-based) ────────────────────

@auth_bp.route("/voter/login", methods=["POST"])
@limiter.limit("20/minute")
@validate_json("walletAddress")
def voter_login():
    """Login a voter by wallet address (verified off-chain record)."""
    data = request.get_json()
    wallet = data["walletAddress"].strip().lower()

    voter = Voter.query.filter(
        db.func.lower(Voter.wallet_address) == wallet
    ).first()

    if not voter or not voter.is_active:
        return jsonify({"ok": False, "error": "Wallet not registered or deactivated"}), 401

    # Create a JWT with voter context
    token = create_access_token(
        identity=voter.id,
        additional_claims={"role": "voter", "wallet": voter.wallet_address},
    )
    return jsonify({
        "ok": True,
        "token": token,
        "voter": voter.to_dict(),
    })


# ──────────────────── VOTER REGISTRATION (admin-only) ────────────────────

@auth_bp.route("/voter/register", methods=["POST"])
@admin_required
@validate_json("name", "rawVoterId", "constituencyId", "walletAddress")
def register_voter():
    """Register a new voter (admin only). Optionally registers on-chain."""
    data = request.get_json()

    from ..services import Web3Service
    ws = Web3Service.get_instance()

    wallet = data["walletAddress"].strip()
    identity_hash = ws.hash_identity(data["rawVoterId"]).hex()

    # Duplicate checks
    if Voter.query.filter_by(wallet_address=wallet).first():
        return jsonify({"ok": False, "error": "Wallet already registered"}), 409
    if Voter.query.filter_by(identity_hash=identity_hash).first():
        return jsonify({"ok": False, "error": "Voter ID already registered"}), 409

    voter = Voter(
        name=data["name"],
        identity_hash=identity_hash,
        wallet_address=wallet,
        constituency_id=int(data["constituencyId"]),
    )

    # Attempt on-chain registration
    tx_hash = None
    try:
        tx_hash = ws.register_voter(
            wallet,
            bytes.fromhex(identity_hash[2:]) if identity_hash.startswith("0x") else bytes.fromhex(identity_hash),
            int(data["constituencyId"]),
        )
        voter.is_registered_onchain = True
        voter.tx_hash = tx_hash
    except Exception as e:
        # Off-chain registration still succeeds; on-chain can be retried
        voter.is_registered_onchain = False

    db.session.add(voter)
    db.session.commit()

    log_audit(
        "voter_registered",
        "voter",
        voter.id,
        {"wallet": wallet, "onchain": voter.is_registered_onchain},
    )

    return jsonify({
        "ok": True,
        "voter": voter.to_dict(),
        "txHash": tx_hash,
    }), 201


# ──────────────────── ADMIN: LIST VOTERS ────────────────────

@auth_bp.route("/admin/voters", methods=["GET"])
@admin_required
def list_voters():
    """List all registered voters (admin only)."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)

    pagination = Voter.query.order_by(Voter.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        "ok": True,
        "voters": [v.to_dict() for v in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
    })


# ──────────────────── ADMIN: PROFILE ────────────────────

@auth_bp.route("/admin/profile", methods=["GET"])
@jwt_required_custom
def admin_profile():
    """Get current admin's profile."""
    from flask import g
    return jsonify({"ok": True, "user": g.current_user.to_dict()})


# ──────────────────── ADMIN: AUDIT LOG ────────────────────

@auth_bp.route("/admin/audit-log", methods=["GET"])
@admin_required
def audit_log():
    """Get audit log (admin only)."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)

    pagination = AuditLog.query.order_by(AuditLog.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        "ok": True,
        "logs": [l.to_dict() for l in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
    })
