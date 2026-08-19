"""allow spoiler-safe hint messages in quest rooms

Revision ID: h3f4c7d8e9a0
Revises: g2e3b6c7d8f9
Create Date: 2026-08-19
"""

from typing import Sequence, Union

from alembic import op

revision: str = "h3f4c7d8e9a0"
down_revision: Union[str, Sequence[str], None] = "g2e3b6c7d8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CONSTRAINT_NAME = "ck_room_message_kind"


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "room_message", type_="check")
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "room_message",
        "kind IN ('chat', 'card', 'hint', 'system', 'activity')",
    )


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "room_message", type_="check")
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "room_message",
        "kind IN ('chat', 'card', 'system', 'activity')",
    )
