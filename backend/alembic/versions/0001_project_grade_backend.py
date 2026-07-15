"""Add durable conversations, pgvector retrieval, usage, and job state.

Revision ID: 0001_project_grade_backend
Revises: None
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from models import Base


revision = "0001_project_grade_backend"
down_revision = None
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    if column.name not in _column_names(table):
        op.add_column(table, column)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Existing installations were created with metadata.create_all(). This
    # safely creates only the new tables while preserving their current data.
    Base.metadata.create_all(bind=bind, checkfirst=True)

    _add_column_if_missing("users", sa.Column("clerk_sub", sa.String(255), nullable=True))
    _add_column_if_missing("files", sa.Column("owner_sub", sa.String(255), nullable=True))
    _add_column_if_missing("files", sa.Column("mime_type", sa.String(255), nullable=True))
    _add_column_if_missing("files", sa.Column("checksum_sha256", sa.String(64), nullable=True))
    _add_column_if_missing("files", sa.Column("size_bytes", sa.BigInteger(), nullable=True))
    _add_column_if_missing("files", sa.Column("embedding_version", sa.String(64), nullable=True))
    _add_column_if_missing("files", sa.Column("processing_error", sa.Text(), nullable=True))
    _add_column_if_missing("files", sa.Column("updated_at", sa.DateTime(), nullable=True))

    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_clerk_sub ON users (clerk_sub)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_files_owner_sub ON files (owner_sub)")

    if bind.dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw "
            "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_document_chunks_fulltext "
            "ON document_chunks USING gin (to_tsvector('english', search_text))"
        )


def downgrade() -> None:
    bind = op.get_bind()
    op.execute("DROP INDEX IF EXISTS ix_users_clerk_sub")
    op.execute("DROP INDEX IF EXISTS ix_files_owner_sub")
    for table_name in (
        "outbox_events",
        "processing_jobs",
        "usage_ledger",
        "daily_usage",
        "message_citations",
        "document_chunks",
        "conversation_messages",
        "conversation_documents",
        "conversations",
    ):
        if table_name in sa.inspect(bind).get_table_names():
            op.drop_table(table_name)

    for table, column in (
        ("users", "clerk_sub"),
        ("files", "owner_sub"),
        ("files", "mime_type"),
        ("files", "checksum_sha256"),
        ("files", "size_bytes"),
        ("files", "embedding_version"),
        ("files", "processing_error"),
        ("files", "updated_at"),
    ):
        if column in _column_names(table):
            op.drop_column(table, column)
