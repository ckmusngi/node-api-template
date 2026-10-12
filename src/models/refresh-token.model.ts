import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

/**
 * Refresh tokens are opaque random strings; only their SHA-256 hash is stored.
 * Every rotation stays in the same `familyId`, so reuse of a revoked token can
 * revoke the whole chain (token theft detection).
 */
export class RefreshToken extends Model<InferAttributes<RefreshToken>, InferCreationAttributes<RefreshToken>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare tokenHash: string;
  declare familyId: string;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare revokedReason: string | null;
  declare replacedById: string | null;
  declare createdByIp: string | null;
  declare userAgent: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize) {
    RefreshToken.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        userId: { type: DataTypes.UUID, allowNull: false },
        tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
        familyId: { type: DataTypes.UUID, allowNull: false },
        expiresAt: { type: DataTypes.DATE, allowNull: false },
        revokedAt: { type: DataTypes.DATE, allowNull: true },
        revokedReason: { type: DataTypes.STRING(64), allowNull: true },
        replacedById: { type: DataTypes.UUID, allowNull: true },
        createdByIp: { type: DataTypes.STRING(64), allowNull: true },
        userAgent: { type: DataTypes.STRING(255), allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'refresh_tokens', modelName: 'RefreshToken' },
    );
  }
}
