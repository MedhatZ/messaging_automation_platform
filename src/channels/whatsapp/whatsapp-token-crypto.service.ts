import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const KEY_LEN = 32;

/**
 * AES-256-GCM for storing WhatsApp Cloud API access tokens at rest.
 */
@Injectable()
export class WhatsappTokenCryptoService {
  constructor(private readonly config: ConfigService) {}

  private getKey(): Buffer {
    const fromEnv = this.config.get<string>('whatsapp.tokenEncryptionKey', {
      infer: true,
    });
    if (fromEnv?.trim()) {
      const buf = Buffer.from(fromEnv.trim(), 'base64');
      if (buf.length !== KEY_LEN) {
        throw new Error(
          'WHATSAPP_TOKEN_ENCRYPTION_KEY must be base64 encoding of exactly 32 bytes',
        );
      }
      return buf;
    }
    const jwtSecret = this.config.getOrThrow<string>('jwt.secret');
    return createHash('sha256').update(jwtSecret, 'utf8').digest();
  }

  encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
    const enc = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(payload: string): string {
    const key = this.getKey();
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
      throw new Error('Invalid encrypted token payload');
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const data = buf.subarray(IV_LEN + AUTH_TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv, {
      authTagLength: AUTH_TAG_LEN,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString('utf8');
  }
}
