"""
Staff login check for every desk endpoint.

Staff sign in on the frontend with Supabase Auth, which hands the browser a
signed token (a JWT) that comes back as "Authorization: Bearer <token>".
Two questions, in order:

  1. Is the token genuine and current? Verified against Supabase's published
     signing keys (or the legacy shared secret). Forged, expired or
     wrong-project tokens are a 401.
  2. Is this person staff? A valid login is not enough: the email must be on
     STAFF_EMAILS, otherwise 403. Sign-ups are disabled on the project too,
     but this check does not rely on that.

Fails closed: AUTH_REQUIRED without SUPABASE_URL refuses every request.
"""

from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from settings import settings

_bearer = HTTPBearer(auto_error=False)
_jwks_client: Optional[jwt.PyJWKClient] = None


def _issuer() -> str:
    return (settings.supabase_url or "").rstrip("/") + "/auth/v1"


def _jwks() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        # Cached: one network call an hour, not one per request.
        _jwks_client = jwt.PyJWKClient(_issuer() + "/.well-known/jwks.json", cache_keys=True, lifespan=3600)
    return _jwks_client


def _unauthorised(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def decode_token(token: str) -> dict:
    """Verify signature, expiry, audience and issuer. Raises 401 on any failure."""
    if not settings.supabase_url:
        raise _unauthorised("Login is not configured on the server (SUPABASE_URL is missing).")
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        options = {"require": ["exp", "sub"]}
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise _unauthorised("This token uses the legacy signing secret, which is not configured.")
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                issuer=_issuer(),
                options=options,
            )
        key = _jwks().get_signing_key_from_jwt(token).key
        return jwt.decode(
            token,
            key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=_issuer(),
            options=options,
        )
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise _unauthorised("Your session has expired. Please sign in again.")
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise _unauthorised("Invalid login token.") from exc


def is_staff_email(email: Optional[str]) -> bool:
    return bool(email) and email.strip().lower() in settings.staff_email_set


def require_staff(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> dict:
    """FastAPI dependency. Returns {"email", "user_id", "auth"} for a signed-in staff member."""
    if not settings.auth_required:
        return {"email": None, "user_id": None, "auth": "disabled"}

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorised("Please sign in.")

    claims = decode_token(credentials.credentials)
    email = claims.get("email")
    if not is_staff_email(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is not on the staff list. Ask whoever runs the desk to add you to STAFF_EMAILS.",
        )
    return {"email": email.strip().lower(), "user_id": claims.get("sub"), "auth": "supabase"}
