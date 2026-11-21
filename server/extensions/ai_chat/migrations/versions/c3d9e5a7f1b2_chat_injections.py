"""chat injections

Revision ID: c3d9e5a7f1b2
Revises: b6a2f1c4d8e3
Create Date: 2026-11-21 15:45:00.000000

STscript's /inject (audit gap 5): ChatModel.injections, a JSON list, [] for none.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d9e5a7f1b2"
down_revision: str | None = "b6a2f1c4d8e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "injections",
                sa.JSON(),
                nullable=False,
                server_default="[]",
                comment="STscript's /inject injections, kept until flushed",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.drop_column("injections")
