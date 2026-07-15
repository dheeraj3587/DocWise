"""Durable conversation, retrieval, citation, usage, and job models."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.database import Base


EMBEDDING_DIMENSION = 384


def _embedding_type():
    """Use native pgvector in PostgreSQL and JSON in SQLite tests."""
    return Vector(EMBEDDING_DIMENSION).with_variant(JSON(), "sqlite")


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        Index("ix_conversations_owner_updated", "owner_sub", "updated_at"),
        Index("ix_conversations_owner_status", "owner_sub", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_sub: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False, default="New chat")
    mode: Mapped[str] = mapped_column(String(24), nullable=False, default="general")
    selected_model_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_through_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ConversationDocument(Base):
    __tablename__ = "conversation_documents"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("files.file_id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (
        UniqueConstraint(
            "conversation_id", "request_id", name="uq_conversation_message_request"
        ),
        Index(
            "ix_conversation_messages_conversation_created",
            "conversation_id",
            "created_at",
        ),
        Index("ix_conversation_messages_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    parent_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversation_messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    role: Mapped[str] = mapped_column(String(24), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="complete")
    provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    original_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reasoning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fallback_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    context_window: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    context_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint(
            "file_id",
            "embedding_version",
            "ordinal",
            "content_hash",
            name="uq_document_chunk_version_ordinal",
        ),
        Index(
            "ix_document_chunks_file_version",
            "file_id",
            "embedding_version",
            "ordinal",
        ),
        Index("ix_document_chunks_owner", "owner_sub"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("files.file_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_sub: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    search_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    page_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    character_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    character_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(255), nullable=False)
    embedding_version: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[list[float]] = mapped_column(_embedding_type(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )


class MessageCitation(Base):
    __tablename__ = "message_citations"
    __table_args__ = (
        UniqueConstraint("message_id", "source_label", name="uq_message_source_label"),
        Index("ix_message_citations_message_order", "message_id", "source_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversation_messages.id", ondelete="CASCADE"),
        nullable=False,
    )
    chunk_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_chunks.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("files.file_id", ondelete="SET NULL"),
        nullable=True,
    )
    source_label: Mapped[str] = mapped_column(String(24), nullable=False)
    source_order: Mapped[int] = mapped_column(Integer, nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    page_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    retrieval_rank: Mapped[int] = mapped_column(Integer, nullable=False)
    retrieval_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    source_removed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )


class DailyUsage(Base):
    __tablename__ = "daily_usage"

    owner_sub: Mapped[str] = mapped_column(String(255), primary_key=True)
    usage_date: Mapped[date] = mapped_column(Date, primary_key=True)
    category: Mapped[str] = mapped_column(String(64), primary_key=True)
    used_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class UsageLedger(Base):
    __tablename__ = "usage_ledger"
    __table_args__ = (
        UniqueConstraint("owner_sub", "request_id", name="uq_usage_owner_request"),
        Index("ix_usage_ledger_owner_created", "owner_sub", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_sub: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversation_messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="chat")
    reserved_units: Mapped[int] = mapped_column(Integer, nullable=False)
    settled_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    refunded_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="reserved")
    provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    usage_metadata: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    __table_args__ = (
        UniqueConstraint("file_id", "kind", "version", name="uq_processing_job_version"),
        Index("ix_processing_jobs_status_heartbeat", "status", "heartbeat_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("files.file_id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued")
    phase: Mapped[str] = mapped_column(String(160), nullable=False, default="Queued")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (
        Index("ix_outbox_events_status_available", "status", "available_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    available_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
