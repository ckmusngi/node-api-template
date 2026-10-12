import { DataTypes } from 'sequelize';
import type { Migration } from '../types';

export const up: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('notes', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'tenants', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  });
  await queryInterface.addIndex('notes', ['user_id', 'deleted_at']);
  await queryInterface.addIndex('notes', ['tenant_id']);
  await queryInterface.addIndex('notes', ['status']);
  await queryInterface.addIndex('notes', ['created_at']);
};

export const down: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.dropTable('notes');
};
