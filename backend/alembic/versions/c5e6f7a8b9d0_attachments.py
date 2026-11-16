"""attachments and user avatars

Revision ID: c5e6f7a8b9d0
Revises: b4d5e6f7a8c9
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c5e6f7a8b9d0'
down_revision: Union[str, Sequence[str], None] = 'b4d5e6f7a8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar_key', sa.String(length=255), nullable=True))
    op.create_table(
        'attachments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uploader_id', sa.Integer(), nullable=False),
        sa.Column('message_id', sa.BigInteger(), nullable=True),
        sa.Column('kind', sa.Enum('image', 'video', 'audio', 'file', name='attachment_kind'), nullable=False),
        sa.Column('mime', sa.String(length=100), nullable=False),
        sa.Column('size', sa.BigInteger(), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('storage_key', sa.String(length=255), nullable=False),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.Column('thumb_key', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['uploader_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_attachments_uploader_id', 'attachments', ['uploader_id'])
    op.create_index('ix_attachments_message_id', 'attachments', ['message_id'])


def downgrade() -> None:
    op.drop_table('attachments')
    op.execute('DROP TYPE attachment_kind')
    op.drop_column('users', 'avatar_key')
