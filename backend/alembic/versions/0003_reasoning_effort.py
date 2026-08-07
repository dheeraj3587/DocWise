"""Persist the reasoning effort chosen for an assistant message.

Revision ID: 0003_reasoning_effort
Revises: 0002_agent_tools
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_reasoning_effort"
down_revision = "0002_agent_tools"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if "reasoning_effort" not in _column_names("conversation_messages"):
        op.add_column(
            "conversation_messages",
            sa.Column("reasoning_effort", sa.String(length=16), nullable=True),
        )


def downgrade() -> None:
    if "reasoning_effort" in _column_names("conversation_messages"):
        op.drop_column("conversation_messages", "reasoning_effort")
