"""review records: decision calls, generation snapshots, message feedback

Revision ID: e1f3a5c7b9d2
Revises: d2e4f6a8b0c1
Create Date: 2026-11-23 12:30:00.000000

What produced a line, kept for review (the operator, 2026-11-23; BLL_AI_Review.py): each decision
model call against the message it was about, each reply's request as sent, and per-message feedback
with a snapshot of both.
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1f3a5c7b9d2"
down_revision: str | None = "d2e4f6a8b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _base() -> list[Any]:
    return [
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("deleted_by_user_id", sa.String(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "decision_calls",
        sa.Column("chat_id", sa.String(), nullable=False, comment="The chat the decision was made in"),
        sa.Column(
            "message_id", sa.String(), nullable=True, comment="The message it was about (null: the chat as a whole)"
        ),
        sa.Column(
            "purpose",
            sa.String(),
            nullable=False,
            comment="What it decided: roll, clarify, next_turn, label_lines, canon…",
        ),
        sa.Column("questions", sa.JSON(), nullable=False, comment="Each question: key, type, instructions"),
        sa.Column("state", sa.String(), nullable=False, comment="The start of the scene it read"),
        sa.Column("answers", sa.JSON(), nullable=False, comment="What came back, per question (null: refused)"),
        sa.Column("model", sa.String(), nullable=False, comment="The decision model asked"),
        sa.Column("ms", sa.Integer(), nullable=False, comment="How long the call took, in milliseconds"),
        *_base(),
        comment="Zephyrex RPG AI decision model calls",
        info={"extension": "ai_chat"},
    )
    op.create_table(
        "generation_snapshots",
        sa.Column("chat_id", sa.String(), nullable=False, comment="The chat"),
        sa.Column("leaf_id", sa.String(), nullable=False, comment="The message the reply answered"),
        sa.Column("mode", sa.String(), nullable=False, comment="The turn's mode (narrate, a voice, table…)"),
        sa.Column("model", sa.String(), nullable=False, comment="The model it was sent to"),
        sa.Column("endpoint_id", sa.String(), nullable=True, comment="The endpoint it was sent to"),
        sa.Column("request", sa.JSON(), nullable=False, comment="The request as sent: messages and sampler"),
        *_base(),
        comment="Zephyrex RPG AI replies' requests as sent",
        info={"extension": "ai_chat"},
    )
    op.create_table(
        "message_feedbacks",
        sa.Column("chat_id", sa.String(), nullable=False, comment="The chat (the message's own)"),
        sa.Column("message_id", sa.String(), nullable=False, comment="The message marked"),
        sa.Column("verdict", sa.String(), nullable=False, comment="bad or good"),
        sa.Column("reason", sa.String(), nullable=False, comment="What went wrong, in a few words"),
        sa.Column("note", sa.String(), nullable=False, comment="More, if the person wants"),
        sa.Column(
            "snapshot",
            sa.JSON(),
            nullable=False,
            comment="What produced the line: its text, the request as sent (prompt, model, sampler) and the "
            "decision calls about it and its parent",
        ),
        *_base(),
        comment="Zephyrex RPG AI per-message feedback, for manual review",
        info={"extension": "ai_chat"},
    )
    for table in ("decision_calls", "generation_snapshots", "message_feedbacks"):
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.create_index(batch_op.f(f"ix_{table}_deleted_at"), ["deleted_at"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    for table in ("message_feedbacks", "generation_snapshots", "decision_calls"):
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_index(batch_op.f(f"ix_{table}_deleted_at"))
        op.drop_table(table)
