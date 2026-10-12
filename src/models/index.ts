import { sequelize } from '../config/database';
import { AuditLog } from './audit-log.model';
import { IdempotencyKey } from './idempotency-key.model';
import { Note } from './note.model';
import { RefreshToken } from './refresh-token.model';
import { Tenant } from './tenant.model';
import { User } from './user.model';
import { UserToken } from './user-token.model';

Tenant.initModel(sequelize);
User.initModel(sequelize);
RefreshToken.initModel(sequelize);
UserToken.initModel(sequelize);
Note.initModel(sequelize);
AuditLog.initModel(sequelize);
IdempotencyKey.initModel(sequelize);

// Associations
Tenant.hasMany(User, { foreignKey: 'tenantId', as: 'users' });
User.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

User.hasMany(RefreshToken, {
  foreignKey: 'userId',
  as: 'refreshTokens',
  onDelete: 'CASCADE',
});
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(UserToken, {
  foreignKey: 'userId',
  as: 'tokens',
  onDelete: 'CASCADE',
});
UserToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Note, { foreignKey: 'userId', as: 'notes' });
Note.belongsTo(User, { foreignKey: 'userId', as: 'author' });

User.hasMany(AuditLog, {
  foreignKey: 'actorId',
  as: 'auditLogs',
  constraints: false,
});
AuditLog.belongsTo(User, {
  foreignKey: 'actorId',
  as: 'actor',
  constraints: false,
});

export { sequelize, AuditLog, IdempotencyKey, Note, RefreshToken, Tenant, User, UserToken };
