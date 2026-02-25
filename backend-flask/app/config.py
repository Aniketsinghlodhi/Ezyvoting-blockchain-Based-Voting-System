import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-this-to-a-random-secret-key")

    # MySQL
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "3306")
    DB_USER = os.getenv("DB_USER", "ezyvoting")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "ezyvoting")
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES", 3600))

    # Blockchain
    RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
    PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")
    VOTER_REGISTRY_ADDRESS = os.getenv("VOTER_REGISTRY_ADDRESS", "")
    ELECTION_FACTORY_ADDRESS = os.getenv("ELECTION_FACTORY_ADDRESS", "")
    VOTE_VERIFIER_ADDRESS = os.getenv("VOTE_VERIFIER_ADDRESS", "")

    # Admin
    ADMIN_INVITE_CODE = os.getenv("ADMIN_INVITE_CODE", "demo-invite-123")

    # CORS
    ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

    # Rate Limiting
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "100/hour")
    RATELIMIT_STORAGE_URI = "memory://"
