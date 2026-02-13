"""File SQLAlchemy model."""

import uuid
from datetime import datetime

from sqlalchemy import String, Float, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.database import Base


class File(Base):
    __tablename__ = "files"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), unique=True, nullable=False, default=uuid.uuid4, index=True
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)  # pdf | audio | video
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)  # MinIO object key
    created_by: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    transcript: Mapped[str] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="processing")  # processing | ready | failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
