import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export const USER_TOKEN_TYPES = ['email_verification', 'password_reset'] as const;
export type UserTokenType = (typeof USER_TOKEN_TYPES)[number];

/** Single-use tokens for email verification and password reset (stored hashed). */
export class UserToken extends Model<InferAttributes<UserToken>, InferCreationAttributes<UserToken>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare type: UserTokenType;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize) {
    UserToken.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        userId: { type: DataTypes.UUID, allowNull: false },
        type: { type: DataTypes.ENUM(...USER_TOKEN_TYPES), allowNull: false },
        tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
        expiresAt: { type: DataTypes.DATE, allowNull: false },
        usedAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'user_tokens', modelName: 'UserToken' },
    );
  }
}
