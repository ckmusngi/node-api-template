import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { User } from './user.model';

export const NOTE_STATUSES = ['draft', 'published', 'archived'] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

/** Example owned resource demonstrating CRUD, ownership checks and soft deletes. */
export class Note extends Model<InferAttributes<Note>, InferCreationAttributes<Note>> {
  declare id: CreationOptional<string>;
  declare tenantId: string | null;
  declare userId: ForeignKey<User['id']>;
  declare title: string;
  declare content: string;
  declare status: CreationOptional<NoteStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;

  declare author?: NonAttribute<User>;

  override toJSON() {
    const values = { ...this.get() } as Record<string, unknown>;
    delete values.deletedAt;
    return values;
  }

  static initModel(sequelize: Sequelize) {
    Note.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        tenantId: { type: DataTypes.UUID, allowNull: true },
        title: { type: DataTypes.STRING(200), allowNull: false },
        content: { type: DataTypes.TEXT, allowNull: false },
        status: {
          type: DataTypes.ENUM(...NOTE_STATUSES),
          allowNull: false,
          defaultValue: 'draft',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
        deletedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'notes', modelName: 'Note', paranoid: true },
    );
  }
}
