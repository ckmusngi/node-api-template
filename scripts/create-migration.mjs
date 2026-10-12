// Usage: npm run migration:create -- add-phone-to-users
import fs from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage: npm run migration:create -- <kebab-case-name>');
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const file = path.join('src', 'db', 'migrations', `${stamp}-${name}.ts`);
fs.writeFileSync(
  file,
  `import { DataTypes } from 'sequelize';
import type { Migration } from '../types';

export const up: Migration = async ({ context: { queryInterface } }) => {
  // await queryInterface.addColumn('users', 'phone', { type: DataTypes.STRING(32), allowNull: true });
  void DataTypes;
  void queryInterface;
};

export const down: Migration = async ({ context: { queryInterface } }) => {
  // await queryInterface.removeColumn('users', 'phone');
  void queryInterface;
};
`,
);
console.log(`Created ${file}`);
