"""chat status line

Revision ID: a7b9c2d4e6f8
Revises: f6a8b1c3d5e7
Create Date: 2026-11-21 22:45:00.000000

The operator, 2026-11-21 ("concise descriptions maintained by campaign events to tell them apart"):
ChatModel.status_line, one spoiler-safe sentence, "" until the summary model writes it.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b9c2d4e6f8"
down_revision: str | None = "f6a8b1c3d5e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "status_line",
                sa.String(),
                nullable=False,
                server_default="",
                comment="One spoiler-safe sentence on where the campaign stands",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.drop_column("status_line")
