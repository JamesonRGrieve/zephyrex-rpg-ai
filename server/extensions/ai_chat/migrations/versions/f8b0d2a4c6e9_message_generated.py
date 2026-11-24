"""message generated

Revision ID: f8b0d2a4c6e9
Revises: b4c6d8e0f2a5
Create Date: 2026-11-24 14:20:00.000000

Whether a saved message was written by a model (a generated reply) rather than typed by the person:
ChatMessageModel.generated. In the GM's seat only the person's own narrator lines are the GM's narration
(Zephyrex RPG's build57 run, chat 99a9f3c0). Existing rows are false.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8b0d2a4c6e9"
down_revision: str | None = "b4c6d8e0f2a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "generated",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
                comment="Written by a model, never typed by the person: never the GM seat's own line",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.drop_column("generated")
