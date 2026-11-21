import { VaultData } from '../types/vault';

const PBKDF2_ITERATIONS = 310_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVaultData(
  data: VaultData,
  passphrase: string
): Promise<{ salt: string; iv: string; ciphertext: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext
  );

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
  };
}

export async function decryptVaultData(
  payload: { salt: string; iv: string; ciphertext: string },
  passphrase: string
): Promise<VaultData> {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const key = await deriveAesKey(passphrase, salt);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );

  const decoder = new TextDecoder();
  const parsed = JSON.parse(decoder.decode(decryptedBuffer)) as VaultData;
  return {
    passwords: Array.isArray(parsed.passwords) ? parsed.passwords : [],
    pdfs: Array.isArray(parsed.pdfs) ? parsed.pdfs : [],
    excels: Array.isArray(parsed.excels) ? parsed.excels : [],
    records: Array.isArray(parsed.records) ? parsed.records : [],
    links: Array.isArray(parsed.links) ? parsed.links : [],
    autoLockMinutes: typeof parsed.autoLockMinutes === 'number' ? parsed.autoLockMinutes : 15,
  };
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  entropyBits: number;
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: 'Very Weak', entropyBits: 0 };
  }

  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 32;

  const entropyBits = Math.round(password.length * Math.log2(Math.max(pool, 1)));

  if (entropyBits < 28) return { score: 0, label: 'Very Weak', entropyBits };
  if (entropyBits < 45) return { score: 1, label: 'Weak', entropyBits };
  if (entropyBits < 64) return { score: 2, label: 'Fair', entropyBits };
  if (entropyBits < 85) return { score: 3, label: 'Strong', entropyBits };
  return { score: 4, label: 'Very Strong', entropyBits };
}

export function generateSecurePassword(options: {
  length: number;
  upper: boolean;
  lower: boolean;
  numbers: boolean;
  symbols: boolean;
}): string {
  const upperChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowerChars = 'abcdefghijkmnopqrstuvwxyz';
  const numberChars = '23456789';
  const symbolChars = '!@#$%^&*()-_=+[]{}';

  let charset = '';
  const guaranteed: string[] = [];

  if (options.upper) {
    charset += upperChars;
    guaranteed.push(upperChars[randomInt(upperChars.length)]);
  }
  if (options.lower) {
    charset += lowerChars;
    guaranteed.push(lowerChars[randomInt(lowerChars.length)]);
  }
  if (options.numbers) {
    charset += numberChars;
    guaranteed.push(numberChars[randomInt(numberChars.length)]);
  }
  if (options.symbols) {
    charset += symbolChars;
    guaranteed.push(symbolChars[randomInt(symbolChars.length)]);
  }

  if (!charset) {
    charset = lowerChars + numberChars;
  }

  const length = Math.max(8, Math.min(64, options.length));
  const result: string[] = [...guaranteed];

  while (result.length < length) {
    result.push(charset[randomInt(charset.length)]);
  }

  // Fisher-Yates shuffle using crypto random
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.slice(0, length).join('');
}

function randomInt(max: number): number {
  const array = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  let value: number;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);
  return value % max;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ts));
}

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
