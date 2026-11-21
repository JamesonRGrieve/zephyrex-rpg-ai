"""chat vox ids

Revision ID: d4e6f8a1b3c5
Revises: c3d9e5a7f1b2
Create Date: 2026-11-21 19:20:00.000000

Decided turns (the operator, 2026-11-21): ChatModel.vox_ids, the cast members on vox (away from the
scene, but a line can reach them), a JSON list, [] for none.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e6f8a1b3c5"
down_revision: str | None = "c3d9e5a7f1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "vox_ids",
                sa.JSON(),
                nullable=False,
                server_default="[]",
                comment="Cast members on vox: away from the scene, but a line can reach them",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.drop_column("vox_ids")
