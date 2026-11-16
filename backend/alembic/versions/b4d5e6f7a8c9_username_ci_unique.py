"""case-insensitive unique usernames

Revision ID: b4d5e6f7a8c9
Revises: a3c4d5e6f7b8
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b4d5e6f7a8c9'
down_revision: Union[str, Sequence[str], None] = 'a3c4d5e6f7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET username = lower(username)")
    op.execute("CREATE UNIQUE INDEX uq_users_username_lower ON users (lower(username))")


def downgrade() -> None:
    op.execute("DROP INDEX uq_users_username_lower")
