import { DataTypes } from 'sequelize';
import type { Migration } from '../types';

export const up: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('idempotency_keys', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    scope: { type: DataTypes.STRING(64), allowNull: false },
    key: { type: DataTypes.STRING(255), allowNull: false },
    method: { type: DataTypes.STRING(10), allowNull: false },
    path: { type: DataTypes.STRING(255), allowNull: false },
    request_hash: { type: DataTypes.CHAR(64), allowNull: false },
    status: {
      type: DataTypes.ENUM('processing', 'completed'),
      allowNull: false,
      defaultValue: 'processing',
    },
    response_status: { type: DataTypes.INTEGER, allowNull: true },
    response_body: { type: DataTypes.JSON, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.addIndex('idempotency_keys', ['scope', 'key'], {
    unique: true,
  });
  await queryInterface.addIndex('idempotency_keys', ['expires_at']);
};

export const down: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.dropTable('idempotency_keys');
};
