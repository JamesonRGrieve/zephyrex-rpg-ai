"""narrator style

Revision ID: f6a8b1c3d5e7
Revises: e5f7a9b2c4d6
Create Date: 2026-11-21 21:00:00.000000

Narrator sliders choose the model by reputation and tune it (the operator, 2026-11-21):
ModelEndpointModel.traits (its reputation over contract/model-traits.json) and ChatModel.narrator_style
(the sliders), JSON objects, {} for none.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a8b1c3d5e7"
down_revision: str | None = "e5f7a9b2c4d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("model_endpoints", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "traits",
                sa.JSON(),
                nullable=False,
                server_default="{}",
                comment="Its reputation as a narrator, over the contract's seeds for its model",
            )
        )
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "narrator_style",
                sa.JSON(),
                nullable=False,
                server_default="{}",
                comment="The narrator's sliders (spice, verbosity, darkness, humour; absent: any)",
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.drop_column("narrator_style")
    with op.batch_alter_table("model_endpoints", schema=None) as batch_op:
        batch_op.drop_column("traits")
