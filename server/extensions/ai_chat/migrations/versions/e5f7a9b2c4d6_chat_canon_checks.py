"""chat canon checks

Revision ID: e5f7a9b2c4d6
Revises: d4e6f8a1b3c5
Create Date: 2026-11-21 20:40:00.000000

The operator, 2026-11-21 ("permanently dismiss for this campaign"): ChatModel.canon_checks, whether a
chat's lines get canon warnings, true by default.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f7a9b2c4d6"
down_revision: str | None = "d4e6f8a1b3c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "canon_checks",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
                comment="Canon warnings on lines (off for a campaign that breaks canon)",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.drop_column("canon_checks")
