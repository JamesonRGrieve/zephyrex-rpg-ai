"""message line labels

Revision ID: d2e4f6a8b0c1
Revises: c1d3e5f7a9b0
Create Date: 2026-11-22 06:50:00.000000

Each line of a saved story message labelled by the decision model (the operator, 2026-11-22):
ChatMessageModel.line_labels, [{index, kind, text, actor_id, actor_name, target_name, manner, icon}],
null until labelled.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2e4f6a8b0c1"
down_revision: str | None = "c1d3e5f7a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "line_labels",
                sa.JSON(),
                nullable=True,
                comment="Each line labelled by the decision model: kind, actor, target, manner, icon (label_lines)",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.drop_column("line_labels")
