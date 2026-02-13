"""Users router — user creation and management."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.rate_limit import rate_limit
from core.security import get_current_user
from models.database import get_db
from models.user import User

router = APIRouter()


class UserCreate(BaseModel):
    email: str
    name: str
    image_url: str | None = None


@router.post("")
async def create_user(
    body: UserCreate,
    _: None = Depends(rate_limit("users")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user if they don't exist."""
    stmt = select(User).where(User.email == body.email)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        return {"status": "exists", "email": existing.email}

    new_user = User(
        email=body.email,
        name=body.name,
        image_url=body.image_url,
    )
    db.add(new_user)

    return {"status": "created", "email": body.email}


@router.get("/me")
async def get_me(
    _: None = Depends(rate_limit("users")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user data."""
    stmt = select(User).where(User.email == user["email"])
    result = await db.execute(stmt)
    db_user = result.scalar_one_or_none()

    if not db_user:
        return {"email": user["email"], "name": user.get("name", "")}

    return {
        "email": db_user.email,
        "name": db_user.name,
        "imageUrl": db_user.image_url,
    }


@router.patch("/{email}")
async def update_user(
    email: str,
    body: dict,
    _: None = Depends(rate_limit("users")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user fields (name, image, etc.)."""
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    db_user = result.scalar_one_or_none()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if "name" in body:
        db_user.name = body["name"]
    if "image_url" in body:
        db_user.image_url = body["image_url"]

    return {"status": "updated"}
