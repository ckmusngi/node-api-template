import bcrypt from 'bcrypt';
import { env } from '../config/env';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A valid bcrypt hash used to keep login timing constant when the email does not exist,
 * so response time does not reveal which accounts are registered.
 */
let dummyHash: string | undefined;
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= await bcrypt.hash('timing-equalizer', env.BCRYPT_ROUNDS);
  await bcrypt.compare(plain, dummyHash);
}
