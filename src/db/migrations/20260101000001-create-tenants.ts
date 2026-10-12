import { DataTypes } from 'sequelize';
import type { Migration } from '../types';

export const up: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('tenants', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    slug: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    status: {
      type: DataTypes.ENUM('active', 'suspended'),
      allowNull: false,
      defaultValue: 'active',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
};

export const down: Migration = async ({ context: { queryInterface } }) => {
  await queryInterface.dropTable('tenants');
};
