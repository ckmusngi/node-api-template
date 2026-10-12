import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import { ROLES, type Role } from '../config/rbac';

export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Columns that must never leave the API. */
const PRIVATE_FIELDS = ['passwordHash', 'failedLoginAttempts', 'lockedUntil', 'deletedAt'] as const;

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare tenantId: string | null;
  declare email: string;
  declare passwordHash: string;
  declare firstName: string;
  declare lastName: string;
  declare role: CreationOptional<Role>;
  declare status: CreationOptional<UserStatus>;
  declare emailVerifiedAt: Date | null;
  declare failedLoginAttempts: CreationOptional<number>;
  declare lockedUntil: Date | null;
  declare lastLoginAt: Date | null;
  declare passwordChangedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;

  get fullName(): NonAttribute<string> {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  override toJSON() {
    const values = { ...this.get() } as Record<string, unknown>;
    for (const field of PRIVATE_FIELDS) delete values[field];
    return values;
  }

  static initModel(sequelize: Sequelize) {
    User.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        tenantId: { type: DataTypes.UUID, allowNull: true },
        email: {
          type: DataTypes.STRING(254),
          allowNull: false,
          unique: true,
          set(value: string) {
            this.setDataValue('email', value.trim().toLowerCase());
          },
        },
        passwordHash: { type: DataTypes.STRING(100), allowNull: false },
        firstName: { type: DataTypes.STRING(80), allowNull: false },
        lastName: { type: DataTypes.STRING(80), allowNull: false },
        role: {
          type: DataTypes.ENUM(...ROLES),
          allowNull: false,
          defaultValue: 'user',
        },
        status: {
          type: DataTypes.ENUM(...USER_STATUSES),
          allowNull: false,
          defaultValue: 'active',
        },
        emailVerifiedAt: { type: DataTypes.DATE, allowNull: true },
        failedLoginAttempts: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        lockedUntil: { type: DataTypes.DATE, allowNull: true },
        lastLoginAt: { type: DataTypes.DATE, allowNull: true },
        passwordChangedAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
        deletedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'users',
        modelName: 'User',
        paranoid: true,
        defaultScope: { attributes: { exclude: ['passwordHash'] } },
        scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
      },
    );
  }
}
