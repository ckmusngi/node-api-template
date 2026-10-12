import { DataTypes } from 'sequelize';
import type { Migration } from '../types';

export const up: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('audit_logs', {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    actor_id: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING(100), allowNull: false },
    entity_type: { type: DataTypes.STRING(64), allowNull: true },
    entity_id: { type: DataTypes.STRING(128), allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.STRING(255), allowNull: true },
    request_id: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.addIndex('audit_logs', ['actor_id']);
  await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_id']);
  await queryInterface.addIndex('audit_logs', ['action']);
  await queryInterface.addIndex('audit_logs', ['created_at']);
};

export const down: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.dropTable('audit_logs');
};
