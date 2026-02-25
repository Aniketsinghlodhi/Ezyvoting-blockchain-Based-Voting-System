"""
Election management routes.
Admins create elections on-chain via ElectionFactory; voters view them.
"""

from datetime import datetime
from flask import Blueprint, request, jsonify, g

from .. import db, limiter
from ..models import Election, Candidate, Result
from ..middleware import jwt_required_custom, admin_required, validate_json, log_audit

elections_bp = Blueprint("elections", __name__)


# ──────────────────── CREATE ELECTION ────────────────────

@elections_bp.route("/", methods=["POST"])
@admin_required
@validate_json("name", "description", "commitDeadline", "revealDeadline", "candidates")
def create_election():
    """Create a new election (off-chain record + on-chain deployment)."""
    data = request.get_json()

    commit_dt = datetime.fromisoformat(data["commitDeadline"])
    reveal_dt = datetime.fromisoformat(data["revealDeadline"])

    if commit_dt <= datetime.utcnow():
        return jsonify({"ok": False, "error": "Commit deadline must be in the future"}), 400
    if reveal_dt <= commit_dt:
        return jsonify({"ok": False, "error": "Reveal deadline must be after commit deadline"}), 400
    if len(data["candidates"]) < 2:
        return jsonify({"ok": False, "error": "At least 2 candidates required"}), 400

    constituency_id = int(data.get("constituencyId", 0))
    election_type = data.get("electionType", "general")

    # Off-chain record first
    election = Election(
        name=data["name"],
        description=data["description"],
        election_type=election_type,
        constituency_id=constituency_id,
        commit_deadline=commit_dt,
        reveal_deadline=reveal_dt,
        status="pending",
        created_by=g.current_user.id,
    )
    db.session.add(election)
    db.session.flush()  # get election.id

    candidate_names = []
    candidate_parties = []
    for idx, c in enumerate(data["candidates"]):
        cand = Candidate(
            election_id=election.id,
            name=c["name"],
            party=c.get("party", "Independent"),
            description=c.get("description", ""),
        )
        db.session.add(cand)
        candidate_names.append(c["name"])
        candidate_parties.append(c.get("party", "Independent"))

    # On-chain deployment
    from ..services import Web3Service
    ws = Web3Service.get_instance()

    onchain_id = None
    ballot_address = None
    tx_hash = None

    try:
        onchain_id, ballot_address = ws.create_election(
            name=data["name"],
            description=data["description"],
            commit_deadline=int(commit_dt.timestamp()),
            reveal_deadline=int(reveal_dt.timestamp()),
            candidate_names=candidate_names,
            candidate_parties=candidate_parties,
            constituency_id=constituency_id,
            election_type=0 if election_type == "general" else 1,
        )
        election.onchain_id = onchain_id
        election.ballot_address = ballot_address
        election.status = "active"
    except Exception as e:
        election.status = "pending"  # can be retried

    db.session.commit()

    log_audit(
        "election_created",
        "election",
        election.id,
        {"name": data["name"], "onchain_id": onchain_id, "ballot_address": ballot_address},
    )

    return jsonify({
        "ok": True,
        "election": election.to_dict(),
        "ballotAddress": ballot_address,
        "onchainId": onchain_id,
    }), 201


# ──────────────────── LIST ELECTIONS ────────────────────

@elections_bp.route("/", methods=["GET"])
def list_elections():
    """List all elections with optional status filter."""
    status_filter = request.args.get("status")
    query = Election.query.order_by(Election.created_at.desc())

    if status_filter:
        query = query.filter_by(status=status_filter)

    elections = query.all()

    # Enrich with on-chain data if available
    from ..services import Web3Service
    ws = Web3Service.get_instance()
    result = []
    for e in elections:
        ed = e.to_dict()
        if e.ballot_address:
            try:
                info = ws.get_election_info(e.ballot_address)
                ed["onchain"] = info
            except Exception:
                ed["onchain"] = None
        result.append(ed)

    return jsonify({"ok": True, "elections": result})


# ──────────────────── GET SINGLE ELECTION ────────────────────

@elections_bp.route("/<int:election_id>", methods=["GET"])
def get_election(election_id):
    """Get detailed election information including on-chain data."""
    election = Election.query.get_or_404(election_id)
    ed = election.to_dict()

    from ..services import Web3Service
    ws = Web3Service.get_instance()

    if election.ballot_address:
        try:
            ed["onchain"] = ws.get_election_info(election.ballot_address)
            ed["candidates_onchain"] = ws.get_ballot_candidates(election.ballot_address)
        except Exception as exc:
            ed["onchain_error"] = str(exc)

    return jsonify({"ok": True, "election": ed})


# ──────────────────── GET ELECTION RESULTS ────────────────────

@elections_bp.route("/<int:election_id>/results", methods=["GET"])
def get_results(election_id):
    """
    Get election results.
    First attempts to read from blockchain; falls back to cached off-chain results.
    """
    election = Election.query.get_or_404(election_id)

    from ..services import Web3Service
    ws = Web3Service.get_instance()

    if election.ballot_address:
        try:
            results = ws.get_ballot_results(election.ballot_address)
            integrity = ws.verify_election_integrity(election.ballot_address)
            return jsonify({
                "ok": True,
                "source": "blockchain",
                "election_name": election.name,
                "results": results,
                "integrity": integrity,
            })
        except Exception:
            pass

    # Fallback: cached off-chain results
    cached = Result.query.filter_by(election_id=election_id).all()
    return jsonify({
        "ok": True,
        "source": "cache",
        "election_name": election.name,
        "results": [r.to_dict() for r in cached],
    })


# ──────────────────── SYNC RESULTS FROM CHAIN ────────────────────

@elections_bp.route("/<int:election_id>/sync-results", methods=["POST"])
@admin_required
def sync_results(election_id):
    """Pull results from blockchain and cache them off-chain."""
    election = Election.query.get_or_404(election_id)

    if not election.ballot_address:
        return jsonify({"ok": False, "error": "No ballot contract deployed"}), 400

    from ..services import Web3Service
    ws = Web3Service.get_instance()

    try:
        results = ws.get_ballot_results(election.ballot_address)
        info = ws.get_election_info(election.ballot_address)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Blockchain error: {str(e)}"}), 500

    # Clear old cached results
    Result.query.filter_by(election_id=election_id).delete()

    max_votes = max((r["vote_count"] for r in results), default=0)

    for r in results:
        cached = Result(
            election_id=election_id,
            candidate_id=r["id"],
            candidate_name=r["name"],
            party=r["party"],
            vote_count=r["vote_count"],
            total_commits=info["total_commits"],
            total_reveals=info["total_reveals"],
            is_winner=(r["vote_count"] == max_votes and max_votes > 0),
        )
        db.session.add(cached)

    election.status = "finalized" if info["is_finalized"] else election.status
    db.session.commit()

    log_audit("results_synced", "election", election_id)

    return jsonify({"ok": True, "results": results, "synced": len(results)})


# ──────────────────── CANCEL ELECTION ────────────────────

@elections_bp.route("/<int:election_id>/cancel", methods=["POST"])
@admin_required
def cancel_election(election_id):
    """Cancel an election (updates both on-chain and off-chain)."""
    election = Election.query.get_or_404(election_id)
    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "Cancelled by admin")

    if election.ballot_address:
        from ..services import Web3Service
        ws = Web3Service.get_instance()
        try:
            ballot = ws.get_ballot_contract(election.ballot_address)
            ws._send_tx(ballot.functions.cancelElection, reason)
        except Exception as e:
            return jsonify({"ok": False, "error": f"On-chain cancel failed: {str(e)}"}), 500

    election.status = "cancelled"
    db.session.commit()

    log_audit("election_cancelled", "election", election_id, {"reason": reason})

    return jsonify({"ok": True, "message": "Election cancelled"})


# ──────────────────── ELECTION ANALYTICS ────────────────────

@elections_bp.route("/<int:election_id>/analytics", methods=["GET"])
@admin_required
def election_analytics(election_id):
    """Get turnout and analytics for an election."""
    election = Election.query.get_or_404(election_id)

    from ..services import Web3Service
    ws = Web3Service.get_instance()

    analytics = {
        "election_name": election.name,
        "status": election.status,
    }

    if election.ballot_address:
        try:
            info = ws.get_election_info(election.ballot_address)
            total_registered = ws.get_total_voters()
            analytics.update({
                "total_registered_voters": total_registered,
                "total_commits": info["total_commits"],
                "total_reveals": info["total_reveals"],
                "turnout_pct": round(
                    (info["total_commits"] / total_registered * 100) if total_registered > 0 else 0, 2
                ),
                "reveal_rate_pct": round(
                    (info["total_reveals"] / info["total_commits"] * 100)
                    if info["total_commits"] > 0 else 0, 2
                ),
                "phase": info["phase"],
                "is_finalized": info["is_finalized"],
                "is_cancelled": info["is_cancelled"],
            })
        except Exception as e:
            analytics["blockchain_error"] = str(e)

    return jsonify({"ok": True, "analytics": analytics})
