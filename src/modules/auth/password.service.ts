import { Injectable } from '@nestjs/common';
import * as argon2 from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async verifyPassword(
    passwordHash: string,
    plainText: string,
  ): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, plainText);
    } catch {
      return false;
    }
  }
}
