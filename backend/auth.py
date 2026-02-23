"""
Authentication module for GHAS Dashboard.

Credentials are configured via environment variables:
  DASHBOARD_USERNAME  (default: admin)
  DASHBOARD_PASSWORD  (default: admin)
  JWT_SECRET          (default: a random secret – set this in production!)
  JWT_EXPIRE_MINUTES  (default: 480 = 8 hours)
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt

# ── Config from environment ────────────────────────────────────────────────
SECRET_KEY     = os.getenv("JWT_SECRET", "change-me-in-production-use-a-long-random-string")
ALGORITHM      = "HS256"
EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))

VALID_USERNAME = os.getenv("DASHBOARD_USERNAME", "admin")
VALID_PASSWORD = os.getenv("DASHBOARD_PASSWORD", "admin")

# Pre-hash the configured password once at startup using bcrypt directly
# bcrypt has a 72-byte input limit; SHA-256 pre-hashing produces a safe
# fixed-length input regardless of password length.
def _prehash(password: str) -> bytes:
    return hashlib.sha256(password.encode()).hexdigest().encode()

_HASHED_PASSWORD: bytes = bcrypt.hashpw(_prehash(VALID_PASSWORD), bcrypt.gensalt())

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Token helpers ──────────────────────────────────────────────────────────
def _create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=EXPIRE_MINUTES)
    return jwt.encode({"sub": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def _verify_token(token: str) -> str:
    """Decode token and return username, or raise 401."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
        if not username:
            raise ValueError("missing sub")
        return username
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI dependency ─────────────────────────────────────────────────────
def require_auth(token: str = Depends(oauth2_scheme)) -> str:
    """Inject into any route to require a valid JWT."""
    return _verify_token(token)


# ── Route handlers ─────────────────────────────────────────────────────────
async def login(form: OAuth2PasswordRequestForm = Depends()):
    """Validate credentials and return a JWT access token."""
    username_ok = form.username == VALID_USERNAME
    password_ok = bcrypt.checkpw(_prehash(form.password), _HASHED_PASSWORD)

    if not (username_ok and password_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {
        "access_token": _create_token(form.username),
        "token_type": "bearer",
        "username": form.username,
        "expires_in": EXPIRE_MINUTES * 60,
    }


def me(username: str = Depends(require_auth)):
    """Return the currently authenticated user."""
    return {"username": username}
