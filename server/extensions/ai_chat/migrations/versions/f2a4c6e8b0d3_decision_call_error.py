"""decision call error

Revision ID: f2a4c6e8b0d3
Revises: e1f3a5c7b9d2
Create Date: 2026-11-23 21:45:00.000000

Zephyrex RPG's live fault, 2026-11-23 (chat 2cc62ee4): a cold decision model timed out and every call was
kept with null answers and no error. DecisionCallModel.error: why a call gave nothing ({kind: timeout |
unreachable | http | parse | empty, detail}), null when it answered.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a4c6e8b0d3"
down_revision: str | None = "e1f3a5c7b9d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("decision_calls", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "error",
                sa.JSON(),
                nullable=True,
                comment="Why the call gave nothing: kind (timeout, unreachable, http, parse, empty) and detail",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("decision_calls", schema=None) as batch_op:
        batch_op.drop_column("error")
