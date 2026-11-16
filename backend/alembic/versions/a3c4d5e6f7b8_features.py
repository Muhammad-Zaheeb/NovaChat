"""profiles, replies, reactions, mute

Revision ID: a3c4d5e6f7b8
Revises: f2b3c4d5e6a7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a3c4d5e6f7b8'
down_revision: Union[str, Sequence[str], None] = 'f2b3c4d5e6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('display_name', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('bio', sa.String(200), nullable=True))
    op.add_column('users', sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('conversation_members', sa.Column('muted', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('messages', sa.Column('reply_to_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key('fk_messages_reply_to', 'messages', 'messages', ['reply_to_id'], ['id'], ondelete='SET NULL')
    op.create_table(
        'message_reactions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('message_id', sa.BigInteger(), sa.ForeignKey('messages.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('emoji', sa.String(16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('message_id', 'user_id', 'emoji', name='uq_reaction'),
    )
    op.create_index('ix_message_reactions_message_id', 'message_reactions', ['message_id'])


def downgrade() -> None:
    op.drop_table('message_reactions')
    op.drop_constraint('fk_messages_reply_to', 'messages', type_='foreignkey')
    op.drop_column('messages', 'reply_to_id')
    op.drop_column('conversation_members', 'muted')
    op.drop_column('users', 'last_seen_at')
    op.drop_column('users', 'bio')
    op.drop_column('users', 'display_name')
