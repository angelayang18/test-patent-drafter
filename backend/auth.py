"""Clerk JWT session verification for protected FastAPI routes."""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

_DEFAULT_JWKS_URL = (
    "https://faithful-mule-85.clerk.accounts.dev/.well-known/jwks.json"
)
CLERK_JWKS_URL = os.environ.get("CLERK_JWKS_URL", _DEFAULT_JWKS_URL)

# Cached at module load — do not recreate per request.
_jwks_client = PyJWKClient(CLERK_JWKS_URL)


def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, str]:
    """Verify the Clerk Bearer JWT and return the authenticated user id.

    Expects ``Authorization: Bearer <token>``. On success returns
    ``{"user_id": <sub claim>}``. Raises ``HTTPException(401)`` when the
    header is missing or the token is invalid/expired.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    token = authorization[len("Bearer ") :].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload: dict[str, Any] = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        user_id = payload.get("sub")
        if not user_id or not isinstance(user_id, str):
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        return {"user_id": user_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session",
        ) from exc
