import { describe, it, expect } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService (Argon2id)', () => {
  const passwordService = new PasswordService();

  it('should hash a password and produce a valid Argon2id hash', async () => {
    const plainText = 'SecurePassword123!';
    const hash = await passwordService.hashPassword(plainText);

    expect(hash).toBeDefined();
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('should successfully verify correct password against hash', async () => {
    const plainText = 'CorrectHorseBatteryStaple';
    const hash = await passwordService.hashPassword(plainText);

    const isValid = await passwordService.verifyPassword(hash, plainText);
    expect(isValid).toBe(true);
  });

  it('should fail verification for incorrect password', async () => {
    const plainText = 'CorrectPassword123';
    const hash = await passwordService.hashPassword(plainText);

    const isValid = await passwordService.verifyPassword(hash, 'WrongPassword');
    expect(isValid).toBe(false);
  });
});
