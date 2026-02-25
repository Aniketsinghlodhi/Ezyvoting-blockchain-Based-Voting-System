"""
Blockchain interaction routes.
Direct blockchain queries, vote verification, commit-reveal helpers.
"""

from flask import Blueprint, request, jsonify

from .. import db, limiter
from ..models import VoteMetadata, Election
from ..middleware import jwt_required_custom, admin_required, validate_json, log_audit

blockchain_bp = Blueprint("blockchain", __name__)


# ──────────────────── NETWORK STATUS ────────────────────

@blockchain_bp.route("/status", methods=["GET"])
def network_status():
    """Get blockchain connectivity and network info."""
    from ..services import Web3Service
    ws = Web3Service.get_instance()

    try:
        connected = ws.w3.is_connected() if ws.w3 else False
        block_number = ws.w3.eth.block_number if connected else None
        chain_id = ws.w3.eth.chain_id if connected else None

        return jsonify({
            "ok": True,
            "connected": connected,
            "blockNumber": block_number,
            "chainId": chain_id,
            "contracts": {
                "voterRegistry": ws.voter_registry.address if ws.voter_registry else None,
                "electionFactory": ws.election_factory.address if ws.election_factory else None,
                "voteVerifier": ws.vote_verifier.address if ws.vote_verifier else None,
            },
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ──────────────────── COMMIT VOTE ────────────────────

@blockchain_bp.route("/vote/commit", methods=["POST"])
@jwt_required_custom
@limiter.limit("5/minute")
@validate_json("ballotAddress", "commitHash")
def record_commit():
    """
    Record a vote commit off-chain.
    The actual on-chain commit is done by the voter's wallet directly in the frontend.
    This endpoint stores the receipt for tracking.
    """
    data = request.get_json()

    ballot_address = data["ballotAddress"]
    commit_hash = data["commitHash"]
    voter_address = data.get("voterAddress", "").strip().lower()

    # Find election by ballot address
    election = Election.query.filter_by(ballot_address=ballot_address).first()
    if not election:
        return jsonify({"ok": False, "error": "Election not found for ballot"}), 404

    # Check for duplicate
    existing = VoteMetadata.query.filter_by(
        election_id=election.id,
        voter_address=voter_address,
    ).first()
    if existing:
        return jsonify({"ok": False, "error": "Already committed for this election"}), 409

    meta = VoteMetadata(
        election_id=election.id,
        voter_address=voter_address,
        receipt_hash=commit_hash,
        commit_tx_hash=data.get("txHash"),
        phase="committed",
    )
    db.session.add(meta)
    db.session.commit()

    return jsonify({"ok": True, "receiptId": meta.id})


# ──────────────────── RECORD REVEAL ────────────────────

@blockchain_bp.route("/vote/reveal", methods=["POST"])
@jwt_required_custom
@limiter.limit("5/minute")
@validate_json("ballotAddress", "voterAddress")
def record_reveal():
    """Record that a voter has completed the reveal phase."""
    data = request.get_json()
    voter_address = data["voterAddress"].strip().lower()

    election = Election.query.filter_by(ballot_address=data["ballotAddress"]).first()
    if not election:
        return jsonify({"ok": False, "error": "Election not found"}), 404

    meta = VoteMetadata.query.filter_by(
        election_id=election.id,
        voter_address=voter_address,
    ).first()

    if not meta:
        return jsonify({"ok": False, "error": "No commit found"}), 404

    from datetime import datetime
    meta.phase = "revealed"
    meta.reveal_tx_hash = data.get("txHash")
    meta.revealed_at = datetime.utcnow()
    db.session.commit()

    return jsonify({"ok": True})


# ──────────────────── VERIFY VOTE RECEIPT ────────────────────

@blockchain_bp.route("/vote/verify", methods=["POST"])
@validate_json("ballotAddress", "voterAddress", "receiptHash")
def verify_vote():
    """
    Verify a voter's receipt on the blockchain.
    Proves participation without revealing the actual vote.
    """
    data = request.get_json()

    from ..services import Web3Service
    ws = Web3Service.get_instance()

    try:
        ballot = ws.get_ballot_contract(data["ballotAddress"])
        is_valid = ballot.functions.verifyReceipt(
            ws.w3.to_checksum_address(data["voterAddress"]),
            bytes.fromhex(data["receiptHash"].replace("0x", "")),
        ).call()

        status = ws.get_voter_commit_status(data["ballotAddress"], data["voterAddress"])

        return jsonify({
            "ok": True,
            "receiptValid": is_valid,
            "voterStatus": status,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ──────────────────── CHECK VOTE STATUS ────────────────────

@blockchain_bp.route("/vote/status/<ballot_address>/<voter_address>", methods=["GET"])
def vote_status(ballot_address, voter_address):
    """Get a voter's commit/reveal status for a specific ballot."""
    from ..services import Web3Service
    ws = Web3Service.get_instance()

    try:
        status = ws.get_voter_commit_status(ballot_address, voter_address)
        return jsonify({"ok": True, **status})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ──────────────────── ELECTION INTEGRITY ────────────────────

@blockchain_bp.route("/election/<ballot_address>/integrity", methods=["GET"])
def election_integrity(ballot_address):
    """Verify election integrity on-chain."""
    from ..services import Web3Service
    ws = Web3Service.get_instance()

    try:
        result = ws.verify_election_integrity(ballot_address)
        if result is None:
            return jsonify({"ok": False, "error": "VoteVerifier not configured"}), 500
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ──────────────────── ELECTION SUMMARY ────────────────────

@blockchain_bp.route("/election/<ballot_address>/summary", methods=["GET"])
def election_summary(ballot_address):
    """Get election summary from VoteVerifier contract."""
    from ..services import Web3Service
    ws = Web3Service.get_instance()

    try:
        summary = ws.get_election_summary(ballot_address)
        if summary is None:
            return jsonify({"ok": False, "error": "VoteVerifier not configured"}), 500
        return jsonify({"ok": True, **summary})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ──────────────────── COMPUTE COMMIT HASH (helper) ────────────────────

@blockchain_bp.route("/compute-commit-hash", methods=["POST"])
@validate_json("candidateId", "secret")
def compute_commit_hash():
    """
    Compute keccak256(candidateId, secret) for the commit-reveal scheme.
    The voter uses this to create their hidden vote commitment.
    """
    data = request.get_json()

    from web3 import Web3
    commit_hash = Web3.solidity_keccak(
        ["uint256", "bytes32"],
        [int(data["candidateId"]), bytes.fromhex(data["secret"].replace("0x", ""))],
    )

    return jsonify({"ok": True, "commitHash": "0x" + commit_hash.hex()})


# ──────────────────── PARTICIPANT CHECK ────────────────────

@blockchain_bp.route("/vote/participated/<ballot_address>/<voter_address>", methods=["GET"])
def did_participate(ballot_address, voter_address):
    """Quick check: did a voter participate?"""
    from ..services import Web3Service
    ws = Web3Service.get_instance()

    try:
        result = ws.did_voter_participate(ballot_address, voter_address)
        if result is None:
            return jsonify({"ok": False, "error": "VoteVerifier not configured"}), 500
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
