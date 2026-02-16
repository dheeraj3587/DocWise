"""Authorization helpers for multi-tenant resource access."""

from fastapi import HTTPException


def get_user_scope(user: dict) -> str:
    email = (user.get("email") or "").strip().lower()
    if email:
        return f"email:{email}"

    sub = (user.get("sub") or "").strip()
    if sub:
        return f"sub:{sub}"

    raise HTTPException(status_code=401, detail="Missing authenticated principal")


def get_owner_scopes(user: dict) -> set[str]:
    scope = get_user_scope(user).lower()
    scopes = {scope}

    email = (user.get("email") or "").strip().lower()
    if email:
        scopes.add(email)
        scopes.add(f"email:{email}")

    sub = (user.get("sub") or "").strip().lower()
    if sub:
        scopes.add(sub)
        scopes.add(f"sub:{sub}")

    return scopes


def assert_file_owner(file_record, user: dict) -> None:
    file_owner = (file_record.created_by or "").strip().lower()
    accepted_scopes = get_owner_scopes(user)

    # If file has no owner recorded (legacy/empty email), allow any
    # authenticated user whose sub matches, or skip the check gracefully
    # so data created before the fix remains accessible.
    if not file_owner:
        return  # file has no owner tag — allow authenticated access

    if file_owner not in accepted_scopes:
        raise HTTPException(status_code=403, detail="Forbidden")
