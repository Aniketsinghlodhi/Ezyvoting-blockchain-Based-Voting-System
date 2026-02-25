"""
Voter management routes.
Covers voter lookup, status, deactivation, and on-chain registration retry.
"""

from flask import Blueprint, request, jsonify

from .. import db, limiter
from ..models import Voter, VoteMetadata
from ..middleware import jwt_required_custom, admin_required, log_audit

voters_bp = Blueprint("voters", __name__)


# ──────────────────── GET VOTER BY WALLET ────────────────────

@voters_bp.route("/wallet/<wallet_address>", methods=["GET"])
@jwt_required_custom
def get_voter_by_wallet(wallet_address):
    """Look up a voter by wallet address."""
    voter = Voter.query.filter(
        db.func.lower(Voter.wallet_address) == wallet_address.strip().lower()
    ).first()

    if not voter:
        return jsonify({"ok": False, "error": "Voter not found"}), 404

    # Enrich with on-chain status
    from ..services import Web3Service
    ws = Web3Service.get_instance()
    onchain = None
    try:
        onchain = ws.get_voter_info(wallet_address)
    except Exception:
        pass

    result = voter.to_dict()
    result["onchain"] = onchain
    return jsonify({"ok": True, "voter": result})


# ──────────────────── GET VOTER ON-CHAIN STATUS ────────────────────

@voters_bp.route("/wallet/<wallet_address>/eligibility", methods=["GET"])
def check_eligibility(wallet_address):
    """Check if a wallet is eligible to vote on-chain."""
    from ..services import Web3Service
    ws = Web3Service.get_instance()

    try:
        eligible = ws.is_voter_eligible(wallet_address)
        info = ws.get_voter_info(wallet_address)
        return jsonify({
            "ok": True,
            "wallet": wallet_address,
            "eligible": eligible,
            "info": info,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ──────────────────── DEACTIVATE VOTER ────────────────────

@voters_bp.route("/<int:voter_id>/deactivate", methods=["POST"])
@admin_required
def deactivate_voter(voter_id):
    """Deactivate a voter (off-chain + on-chain if possible)."""
    voter = Voter.query.get_or_404(voter_id)
    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "Deactivated by admin")

    voter.is_active = False
    db.session.commit()

    # Attempt on-chain deactivation
    from ..services import Web3Service
    ws = Web3Service.get_instance()
    try:
        if ws.voter_registry:
            ws._send_tx(
                ws.voter_registry.functions.deactivateVoter,
                ws.w3.to_checksum_address(voter.wallet_address),
                reason,
            )
    except Exception:
        pass  # off-chain deactivation still sticks

    log_audit("voter_deactivated", "voter", voter_id, {"reason": reason})

    return jsonify({"ok": True, "message": "Voter deactivated"})


# ──────────────────── REACTIVATE VOTER ────────────────────

@voters_bp.route("/<int:voter_id>/reactivate", methods=["POST"])
@admin_required
def reactivate_voter(voter_id):
    """Reactivate a deactivated voter."""
    voter = Voter.query.get_or_404(voter_id)
    voter.is_active = True
    db.session.commit()

    from ..services import Web3Service
    ws = Web3Service.get_instance()
    try:
        if ws.voter_registry:
            ws._send_tx(
                ws.voter_registry.functions.reactivateVoter,
                ws.w3.to_checksum_address(voter.wallet_address),
            )
    except Exception:
        pass

    log_audit("voter_reactivated", "voter", voter_id)

    return jsonify({"ok": True, "message": "Voter reactivated"})


# ──────────────────── RETRY ON-CHAIN REGISTRATION ────────────────────

@voters_bp.route("/<int:voter_id>/register-onchain", methods=["POST"])
@admin_required
def retry_onchain_registration(voter_id):
    """Retry on-chain registration for a voter that failed earlier."""
    voter = Voter.query.get_or_404(voter_id)

    if voter.is_registered_onchain:
        return jsonify({"ok": False, "error": "Already registered on-chain"}), 400

    from ..services import Web3Service
    ws = Web3Service.get_instance()

    identity_bytes = bytes.fromhex(
        voter.identity_hash[2:] if voter.identity_hash.startswith("0x") else voter.identity_hash
    )

    try:
        tx_hash = ws.register_voter(voter.wallet_address, identity_bytes, voter.constituency_id)
        voter.is_registered_onchain = True
        voter.tx_hash = tx_hash
        db.session.commit()

        log_audit("voter_registered_onchain", "voter", voter_id, {"tx_hash": tx_hash})

        return jsonify({"ok": True, "txHash": tx_hash})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ──────────────────── VOTER VOTE HISTORY ────────────────────

@voters_bp.route("/wallet/<wallet_address>/votes", methods=["GET"])
@jwt_required_custom
def voter_vote_history(wallet_address):
    """Get all vote receipts for a wallet."""
    votes = VoteMetadata.query.filter_by(
        voter_address=wallet_address.strip().lower()
    ).order_by(VoteMetadata.committed_at.desc()).all()

    return jsonify({
        "ok": True,
        "votes": [v.to_dict() for v in votes],
    })


# ──────────────────── VOTER STATISTICS ────────────────────

@voters_bp.route("/stats", methods=["GET"])
@admin_required
def voter_stats():
    """Get voter registration statistics."""
    total = Voter.query.count()
    active = Voter.query.filter_by(is_active=True).count()
    onchain = Voter.query.filter_by(is_registered_onchain=True).count()

    from ..services import Web3Service
    ws = Web3Service.get_instance()
    onchain_total = 0
    try:
        onchain_total = ws.get_total_voters()
    except Exception:
        pass

    return jsonify({
        "ok": True,
        "stats": {
            "total_offchain": total,
            "active": active,
            "inactive": total - active,
            "registered_onchain": onchain,
            "onchain_total": onchain_total,
        },
    })
