from functools import wraps
from flask import request, jsonify, g
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
from ..models import User, AuditLog
from .. import db


def jwt_required_custom(fn):
    """Custom JWT decorator that also loads the user object."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        identity = get_jwt_identity()
        user = User.query.get(identity)
        if not user or not user.is_active:
            return jsonify({"error": "Invalid or deactivated user"}), 401
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    """Requires the current user to be an admin."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        identity = get_jwt_identity()
        user = User.query.get(identity)
        if not user or not user.is_active:
            return jsonify({"error": "Invalid or deactivated user"}), 401
        if user.role not in ("admin", "super_admin"):
            return jsonify({"error": "Admin access required"}), 403
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def log_audit(action, resource_type=None, resource_id=None, details=None):
    """Record an administrative action in the audit log."""
    user_id = None
    if hasattr(g, "current_user") and g.current_user:
        user_id = g.current_user.id

    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=request.remote_addr,
    )
    db.session.add(log)
    db.session.commit()


def validate_json(*required_fields):
    """Decorator to validate that required JSON fields are present."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            data = request.get_json(silent=True)
            if not data:
                return jsonify({"error": "JSON body required"}), 400
            missing = [f for f in required_fields if f not in data or data[f] == ""]
            if missing:
                return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
            return fn(*args, **kwargs)

        return wrapper

    return decorator
