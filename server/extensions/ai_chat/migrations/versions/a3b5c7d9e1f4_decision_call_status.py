"""decision call status

Revision ID: a3b5c7d9e1f4
Revises: f2a4c6e8b0d3
Create Date: 2026-11-24 03:40:00.000000

The operator, 2026-11-24: "Each decision model call should be an icon under the prior message ... A fail
should be red, with a retry stacking up beside it." DecisionCallModel.status (running while asked, then
done or failed) and attempt (which try: a retry is its own record).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3b5c7d9e1f4"
down_revision: str | None = "f2a4c6e8b0d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("decision_calls", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "status",
                sa.String(),
                nullable=False,
                server_default="done",
                comment="running while asked, then done or failed",
            )
        )
        batch_op.add_column(
            sa.Column(
                "attempt",
                sa.Integer(),
                nullable=False,
                server_default="1",
                comment="Which try this was (a retry is its own record)",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("decision_calls", schema=None) as batch_op:
        batch_op.drop_column("attempt")
        batch_op.drop_column("status")
