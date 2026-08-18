"""add reusable card metadata

Revision ID: b7f8c1a2d3e4
Revises: 4fb175d7540d
Create Date: 2026-08-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7f8c1a2d3e4"
down_revision: Union[str, Sequence[str], None] = "4fb175d7540d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add reusable deck metadata and built-in content protection flags."""
    op.add_column(
        "card",
        sa.Column("topic", sa.String(), nullable=False, server_default="Custom"),
    )
    op.add_column(
        "card",
        sa.Column("domain", sa.String(), nullable=False, server_default="General"),
    )
    op.add_column(
        "card",
        sa.Column("kind", sa.String(), nullable=False, server_default="concept"),
    )
    op.add_column(
        "card",
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(op.f("ix_card_topic"), "card", ["topic"], unique=False)
    op.create_index(op.f("ix_card_domain"), "card", ["domain"], unique=False)
    op.create_index(op.f("ix_card_kind"), "card", ["kind"], unique=False)
    op.create_index(op.f("ix_card_is_builtin"), "card", ["is_builtin"], unique=False)


def downgrade() -> None:
    """Remove reusable deck metadata."""
    op.drop_index(op.f("ix_card_is_builtin"), table_name="card")
    op.drop_index(op.f("ix_card_kind"), table_name="card")
    op.drop_index(op.f("ix_card_domain"), table_name="card")
    op.drop_index(op.f("ix_card_topic"), table_name="card")
    op.drop_column("card", "is_builtin")
    op.drop_column("card", "kind")
    op.drop_column("card", "domain")
    op.drop_column("card", "topic")
