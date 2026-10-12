import { DataTypes } from 'sequelize';
import type { Migration } from '../types';

export const up: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('users', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'tenants', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(100), allowNull: false },
    first_name: { type: DataTypes.STRING(80), allowNull: false },
    last_name: { type: DataTypes.STRING(80), allowNull: false },
    role: {
      type: DataTypes.ENUM('user', 'admin'),
      allowNull: false,
      defaultValue: 'user',
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      allowNull: false,
      defaultValue: 'active',
    },
    email_verified_at: { type: DataTypes.DATE, allowNull: true },
    failed_login_attempts: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    locked_until: { type: DataTypes.DATE, allowNull: true },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    password_changed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  });
  await queryInterface.addIndex('users', ['tenant_id']);
  await queryInterface.addIndex('users', ['role']);
  await queryInterface.addIndex('users', ['status']);
  await queryInterface.addIndex('users', ['deleted_at']);
};

export const down: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.dropTable('users');
};
