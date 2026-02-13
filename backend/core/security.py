"""Authentication & security utilities — Clerk JWT verification."""

from typing import Optional
import hashlib
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import httpx

from core.config import settings

security = HTTPBearer(auto_error=False)
api_key_security = APIKeyHeader(name="X-API-Key", auto_error=False)

_jwks_cache: Optional[dict] = None


def _verify_api_key(api_key: Optional[str]) -> Optional[dict]:
    if not isinstance(api_key, str):
        return None

    if not api_key:
        return None

    if not settings.API_KEYS:
        return None

    for configured_key in settings.API_KEYS:
        if secrets.compare_digest(api_key, configured_key):
            fingerprint = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]
            return {
                "sub": f"api_key:{fingerprint}",
                "email": "",
                "name": "API Key Client",
                "image_url": "",
                "auth_type": "api_key",
            }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key",
    )


async def _get_jwks() -> dict:
    """Fetch Clerk JWKS (cached after first call)."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache

    if not settings.CLERK_JWKS_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured (CLERK_JWKS_URL missing)",
        )

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(settings.CLERK_JWKS_URL)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        return _jwks_cache


def clear_jwks_cache():
    """Clear the JWKS cache (useful for testing)."""
    global _jwks_cache
    _jwks_cache = None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    api_key: Optional[str] = Depends(api_key_security),
) -> dict:
    """
    Verify the Clerk JWT and return the decoded payload.
    Returns dict with at least 'sub' (user id) and 'email'.
    """
    api_key_user = _verify_api_key(api_key)
    if api_key_user is not None:
        return api_key_user

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    token = credentials.credentials

    try:
        jwks = await _get_jwks()
        # Decode header to find the matching key
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        rsa_key = None
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                rsa_key = key
                break

        if rsa_key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find signing key",
            )

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            issuer=settings.CLERK_ISSUER,
            options={"verify_aud": False},
        )

        return {
            "sub": payload.get("sub"),
            "email": payload.get("email", payload.get("email_address", "")),
            "name": payload.get("name", ""),
            "image_url": payload.get("image_url", ""),
        }

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    api_key: Optional[str] = Depends(api_key_security),
) -> Optional[dict]:
    """Return user payload if token present, else None."""
    api_key_user = _verify_api_key(api_key)
    if api_key_user is not None:
        return api_key_user

    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, None)
    except HTTPException:
        return None
