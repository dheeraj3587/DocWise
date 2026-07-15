"""Add bounded agent runs, durable tool traces, and web citations.

Revision ID: 0002_agent_tools
Revises: 0001_project_grade_backend
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_agent_tools"
down_revision = "0001_project_grade_backend"
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
    _add_column_if_missing(
        "conversation_messages",
        sa.Column("agent_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    _add_column_if_missing(
        "conversation_messages",
        sa.Column("agent_iterations", sa.Integer(), nullable=False, server_default="0"),
    )
    _add_column_if_missing(
        "conversation_messages",
        sa.Column("tool_call_count", sa.Integer(), nullable=False, server_default="0"),
    )

    _add_column_if_missing(
        "message_citations",
        sa.Column(
            "source_type",
            sa.String(length=24),
            nullable=False,
            server_default="document",
        ),
    )
    _add_column_if_missing(
        "message_citations", sa.Column("web_url", sa.Text(), nullable=True)
    )
    _add_column_if_missing(
        "message_citations", sa.Column("web_title", sa.String(length=500), nullable=True)
    )
    _add_column_if_missing(
        "message_citations", sa.Column("web_domain", sa.String(length=255), nullable=True)
    )
    _add_column_if_missing(
        "message_citations", sa.Column("retrieved_at", sa.DateTime(), nullable=True)
    )

    inspector = sa.inspect(op.get_bind())
    if "tool_invocations" not in inspector.get_table_names():
        op.create_table(
            "tool_invocations",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("assistant_message_id", sa.UUID(), nullable=False),
            sa.Column("provider_tool_call_id", sa.String(length=255), nullable=False),
            sa.Column("sequence", sa.Integer(), nullable=False),
            sa.Column("iteration", sa.Integer(), nullable=False),
            sa.Column("tool_name", sa.String(length=64), nullable=False),
            sa.Column("arguments", sa.JSON(), nullable=False),
            sa.Column("result_summary", sa.JSON(), nullable=False),
            sa.Column("source_labels", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("error_code", sa.String(length=80), nullable=True),
            sa.Column("error_detail", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(
                ["assistant_message_id"],
                ["conversation_messages.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "assistant_message_id",
                "provider_tool_call_id",
                name="uq_tool_invocation_provider_call",
            ),
        )
        op.create_index(
            "ix_tool_invocations_message_sequence",
            "tool_invocations",
            ["assistant_message_id", "sequence"],
        )
        op.create_index(
            "ix_tool_invocations_status", "tool_invocations", ["status"]
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "tool_invocations" in inspector.get_table_names():
        op.drop_index(
            "ix_tool_invocations_status", table_name="tool_invocations"
        )
        op.drop_index(
            "ix_tool_invocations_message_sequence", table_name="tool_invocations"
        )
        op.drop_table("tool_invocations")

    for column in (
        "retrieved_at",
        "web_domain",
        "web_title",
        "web_url",
        "source_type",
    ):
        if column in _column_names("message_citations"):
            op.drop_column("message_citations", column)

    for column in ("tool_call_count", "agent_iterations", "agent_mode"):
        if column in _column_names("conversation_messages"):
            op.drop_column("conversation_messages", column)
