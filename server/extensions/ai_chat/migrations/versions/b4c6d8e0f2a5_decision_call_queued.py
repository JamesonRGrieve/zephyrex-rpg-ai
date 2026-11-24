"""decision call queued

Revision ID: b4c6d8e0f2a5
Revises: a3b5c7d9e1f4
Create Date: 2026-11-24 05:05:00.000000

Zephyrex RPG, 2026-11-24 (the operator's chat 64e11be8: a round's scene step took about 40 s): how much of a
decision call's ms was spent waiting for a decide slot, so the model's own time (ms - queued_ms) shows.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4c6d8e0f2a5"
down_revision: str | None = "a3b5c7d9e1f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("decision_calls", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "queued_ms",
                sa.Integer(),
                nullable=False,
                server_default="0",
                comment="Of ms, how long it waited for a decide slot before it was sent",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("decision_calls", schema=None) as batch_op:
        batch_op.drop_column("queued_ms")
