import { DataTypes } from 'sequelize';
import type { Migration } from '../types';

export const up: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('refresh_tokens', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    family_id: { type: DataTypes.UUID, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    revoked_reason: { type: DataTypes.STRING(64), allowNull: true },
    replaced_by_id: { type: DataTypes.UUID, allowNull: true },
    created_by_ip: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.addIndex('refresh_tokens', ['user_id']);
  await queryInterface.addIndex('refresh_tokens', ['family_id']);
  await queryInterface.addIndex('refresh_tokens', ['expires_at']);
};

export const down: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.dropTable('refresh_tokens');
};
