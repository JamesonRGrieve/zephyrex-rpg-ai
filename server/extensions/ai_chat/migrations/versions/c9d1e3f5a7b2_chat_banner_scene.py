"""chat banner scene

Revision ID: c9d1e3f5a7b2
Revises: f8b0d2a4c6e9
Create Date: 2026-11-24 16:00:00.000000

The VTT scene a chat's location banner last marked: ChatModel.banner_scene_id. map_step compares the current
scene with it, so a restart never shows the banner again (the operator, 2026-11-24: "Got another random ass
location banner"; the previous scene was kept only in process memory). Existing rows are null: their current
scene is taken as seen.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d1e3f5a7b2"
down_revision: str | None = "f8b0d2a4c6e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "banner_scene_id",
                sa.String(),
                nullable=True,
                comment="The VTT scene the chat's location banner last marked (null: none yet)",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.drop_column("banner_scene_id")
