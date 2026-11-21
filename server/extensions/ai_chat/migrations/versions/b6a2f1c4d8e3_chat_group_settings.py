"""chat group settings

Revision ID: b6a2f1c4d8e3
Revises: e8ca581f9c47
Create Date: 2026-11-21 15:20:00.000000

A group chat's modes (audit gap 6): ChatModel.group_settings, a JSON object, {} for none set.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b6a2f1c4d8e3"
down_revision: str | None = "e8ca581f9c47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "group_settings",
                sa.JSON(),
                nullable=False,
                server_default="{}",
                comment="A group's modes: card mode, order, allow self, auto-reply, scenario",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.drop_column("group_settings")
