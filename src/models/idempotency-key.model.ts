import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export class IdempotencyKey extends Model<InferAttributes<IdempotencyKey>, InferCreationAttributes<IdempotencyKey>> {
  declare id: CreationOptional<string>;
  /** Who the key belongs to (user id, or "anonymous"); keys are unique per scope. */
  declare scope: string;
  declare key: string;
  declare method: string;
  declare path: string;
  declare requestHash: string;
  declare status: CreationOptional<'processing' | 'completed'>;
  declare responseStatus: number | null;
  declare responseBody: unknown;
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize) {
    IdempotencyKey.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        scope: { type: DataTypes.STRING(64), allowNull: false },
        key: { type: DataTypes.STRING(255), allowNull: false },
        method: { type: DataTypes.STRING(10), allowNull: false },
        path: { type: DataTypes.STRING(255), allowNull: false },
        requestHash: { type: DataTypes.CHAR(64), allowNull: false },
        status: {
          type: DataTypes.ENUM('processing', 'completed'),
          allowNull: false,
          defaultValue: 'processing',
        },
        responseStatus: { type: DataTypes.INTEGER, allowNull: true },
        responseBody: { type: DataTypes.JSON, allowNull: true },
        expiresAt: { type: DataTypes.DATE, allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'idempotency_keys',
        modelName: 'IdempotencyKey',
        indexes: [{ unique: true, fields: ['scope', 'key'] }],
      },
    );
  }
}
