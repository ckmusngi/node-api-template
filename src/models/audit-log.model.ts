import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

/** Append-only record of security-relevant and administrative actions. */
export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>;
  declare tenantId: string | null;
  declare actorId: string | null;
  declare action: string;
  declare entityType: string | null;
  declare entityId: string | null;
  declare metadata: Record<string, unknown> | null;
  declare ip: string | null;
  declare userAgent: string | null;
  declare requestId: string | null;
  declare createdAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize) {
    AuditLog.init(
      {
        id: {
          type: DataTypes.BIGINT.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        tenantId: { type: DataTypes.UUID, allowNull: true },
        actorId: { type: DataTypes.UUID, allowNull: true },
        action: { type: DataTypes.STRING(100), allowNull: false },
        entityType: { type: DataTypes.STRING(64), allowNull: true },
        entityId: { type: DataTypes.STRING(128), allowNull: true },
        metadata: { type: DataTypes.JSON, allowNull: true },
        ip: { type: DataTypes.STRING(64), allowNull: true },
        userAgent: { type: DataTypes.STRING(255), allowNull: true },
        requestId: { type: DataTypes.STRING(64), allowNull: true },
        createdAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'audit_logs',
        modelName: 'AuditLog',
        updatedAt: false,
      },
    );
  }
}
