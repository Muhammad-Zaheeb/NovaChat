"""email verification

Revision ID: e1a2b3c4d5f6
Revises: c77c6e45f80f
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e1a2b3c4d5f6'
down_revision: Union[str, Sequence[str], None] = 'c77c6e45f80f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    # Existing users predate verification: never lock them out.
    op.execute("UPDATE users SET email_verified = true, email_verified_at = now()")
    op.create_table(
        'email_verification_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_email_verification_codes_user_id'), 'email_verification_codes', ['user_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_email_verification_codes_user_id'), table_name='email_verification_codes')
    op.drop_table('email_verification_codes')
    op.drop_column('users', 'email_verified_at')
    op.drop_column('users', 'email_verified')
