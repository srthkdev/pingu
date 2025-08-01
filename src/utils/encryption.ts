import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

/**
 * Simple encryption utility for storing sensitive data like GitHub tokens
 */
export class EncryptionUtil {
  private static getKey(): string {
    return process.env.ENCRYPTION_SECRET || 'default-secret-key-change-in-production-32-chars';
  }

  /**
   * Encrypt a string value
   */
  static encrypt(text: string): string {
    const key = crypto.createHash('sha256').update(this.getKey()).digest();
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Combine iv and encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt a string value
   */
  static decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const key = crypto.createHash('sha256').update(this.getKey()).digest();
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Check if a string appears to be encrypted
   */
  static isEncrypted(data: string): boolean {
    return data.includes(':') && data.length > 32;
  }
}