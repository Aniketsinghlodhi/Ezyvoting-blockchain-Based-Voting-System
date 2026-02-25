from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from datetime import timedelta

from .config import Config

db = SQLAlchemy()
jwt = JWTManager()
migrate = Migrate()
limiter = Limiter(key_func=get_remote_address, default_limits=["100/hour"])


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
        seconds=app.config["JWT_ACCESS_TOKEN_EXPIRES"]
    )

    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)

    CORS(
        app,
        origins=app.config["ALLOWED_ORIGINS"],
        supports_credentials=True,
    )

    # Register blueprints
    from .routes import register_routes

    register_routes(app)

    # Health check
    @app.route("/")
    def index():
        return {"ok": True, "name": "EzyVoting Backend", "version": "1.0.0"}

    @app.route("/health")
    def health():
        return {"ok": True, "status": "healthy"}

    # Create tables on first request (dev convenience)
    with app.app_context():
        from . import models  # noqa: F401

        db.create_all()

    return app
