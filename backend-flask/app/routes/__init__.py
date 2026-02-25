def register_routes(app):
    from .auth import auth_bp
    from .elections import elections_bp
    from .voters import voters_bp
    from .blockchain import blockchain_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(elections_bp, url_prefix="/api/elections")
    app.register_blueprint(voters_bp, url_prefix="/api/voters")
    app.register_blueprint(blockchain_bp, url_prefix="/api/blockchain")
