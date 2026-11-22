"""message revision

Revision ID: c1d3e5f7a9b0
Revises: b8c0d2e4f6a1
Create Date: 2026-11-22 05:20:00.000000

A story line the client wrote again (the operator, 2026-11-22): ChatMessageModel.revision, its first
answer, why it was rewritten and how ({original, reason, kind}); null for a line written once.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d3e5f7a9b0"
down_revision: str | None = "b8c0d2e4f6a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "revision",
                sa.JSON(),
                nullable=True,
                comment="A line written again: the first answer, why it was rewritten, and how (canon, voice, meta)",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.drop_column("revision")
