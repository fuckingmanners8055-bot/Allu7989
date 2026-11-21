import { AccountRecord, VaultData, WrappedKeyPayload } from '../types/vault';

const PBKDF2_ITERATIONS = 310_000;
const RECOVERY_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
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

async function deriveSecretBitsAndKey(
  secret: string,
  salt: Uint8Array
): Promise<{ verifier: string; aesKey: CryptoKey }> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive 512 bits: first 256 bits = AES-256-GCM wrapping key, next 256 bits = verifier hash
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    512
  );

  const full = new Uint8Array(bits);
  const keyBytes = full.slice(0, 32);
  const verifierBytes = full.slice(32, 64);

  const aesKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return {
    verifier: bytesToBase64(verifierBytes),
    aesKey,
  };
}

async function wrapDekWithAesKey(
  dekBytes: Uint8Array,
  wrappingKey: CryptoKey
): Promise<WrappedKeyPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    wrappingKey,
    dekBytes as BufferSource
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function unwrapDekWithAesKey(
  wrapped: WrappedKeyPayload,
  wrappingKey: CryptoKey
): Promise<Uint8Array> {
  const iv = base64ToBytes(wrapped.iv);
  const ciphertext = base64ToBytes(wrapped.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    wrappingKey,
    ciphertext as BufferSource
  );
  return new Uint8Array(decrypted);
}

export function generateRecoveryKey(): string {
  const random = new Uint8Array(24);
  crypto.getRandomValues(random);
  let chars = '';
  for (let i = 0; i < 24; i++) {
    chars += RECOVERY_CHARSET[random[i] % RECOVERY_CHARSET.length];
  }
  return chars.match(/.{1,4}/g)?.join('-') || chars;
}

function normalizeSecretInput(val: string): string {
  return val.trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeAnswerInput(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function encryptVaultWithDek(
  data: VaultData,
  dekBase64: string
): Promise<{ iv: string; ciphertext: string }> {
  const dekBytes = base64ToBytes(dekBase64);
  const dekKey = await crypto.subtle.importKey(
    'raw',
    dekBytes as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dekKey,
    plaintext
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptVaultWithDek(
  payload: { iv: string; ciphertext: string },
  dekBase64: string
): Promise<VaultData> {
  const dekBytes = base64ToBytes(dekBase64);
  const dekKey = await crypto.subtle.importKey(
    'raw',
    dekBytes as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dekKey,
    ciphertext as BufferSource
  );
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as VaultData;
  return {
    passwords: Array.isArray(parsed.passwords) ? parsed.passwords : [],
    pdfs: Array.isArray(parsed.pdfs) ? parsed.pdfs : [],
    excels: Array.isArray(parsed.excels) ? parsed.excels : [],
    records: Array.isArray(parsed.records) ? parsed.records : [],
    links: Array.isArray(parsed.links) ? parsed.links : [],
    autoLockMinutes: typeof parsed.autoLockMinutes === 'number' ? parsed.autoLockMinutes : 15,
  };
}

export async function createAccountAndWrapVault(params: {
  loginId: string;
  password: string;
  securityQuestion?: string;
  securityAnswer?: string;
}): Promise<{
  account: AccountRecord;
  recoveryKey: string;
  dekBase64: string;
}> {
  const dekBytes = crypto.getRandomValues(new Uint8Array(32));
  const dekBase64 = bytesToBase64(dekBytes);

  const passwordSaltBytes = crypto.getRandomValues(new Uint8Array(16));
  const passwordDerived = await deriveSecretBitsAndKey(params.password, passwordSaltBytes);
  const wrappedByPassword = await wrapDekWithAesKey(dekBytes, passwordDerived.aesKey);

  const recoveryKey = generateRecoveryKey();
  const recoverySaltBytes = crypto.getRandomValues(new Uint8Array(16));
  const recoveryDerived = await deriveSecretBitsAndKey(
    normalizeSecretInput(recoveryKey),
    recoverySaltBytes
  );
  const wrappedByRecovery = await wrapDekWithAesKey(dekBytes, recoveryDerived.aesKey);

  let securityFields: Pick<
    AccountRecord,
    | 'securityQuestion'
    | 'securityAnswerSalt'
    | 'securityAnswerVerifier'
    | 'wrappedKeyBySecurityAnswer'
  > = {};

  if (params.securityQuestion?.trim() && params.securityAnswer?.trim()) {
    const ansSaltBytes = crypto.getRandomValues(new Uint8Array(16));
    const ansDerived = await deriveSecretBitsAndKey(
      normalizeAnswerInput(params.securityAnswer),
      ansSaltBytes
    );
    const wrappedByAns = await wrapDekWithAesKey(dekBytes, ansDerived.aesKey);
    securityFields = {
      securityQuestion: params.securityQuestion.trim(),
      securityAnswerSalt: bytesToBase64(ansSaltBytes),
      securityAnswerVerifier: ansDerived.verifier,
      wrappedKeyBySecurityAnswer: wrappedByAns,
    };
  }

  const now = Date.now();
  const account: AccountRecord = {
    loginId: params.loginId.trim(),
    loginIdNormalized: params.loginId.trim().toLowerCase(),
    passwordSalt: bytesToBase64(passwordSaltBytes),
    passwordVerifier: passwordDerived.verifier,
    wrappedKeyByPassword: wrappedByPassword,
    recoveryKeySalt: bytesToBase64(recoverySaltBytes),
    recoveryKeyVerifier: recoveryDerived.verifier,
    wrappedKeyByRecovery: wrappedByRecovery,
    ...securityFields,
    createdAt: now,
    updatedAt: now,
  };

  return { account, recoveryKey, dekBase64 };
}

export async function authenticateWithPassword(
  account: AccountRecord,
  loginId: string,
  password: string
): Promise<string | null> {
  if (loginId.trim().toLowerCase() !== account.loginIdNormalized) {
    return null;
  }

  const salt = base64ToBytes(account.passwordSalt);
  const derived = await deriveSecretBitsAndKey(password, salt);
  if (derived.verifier !== account.passwordVerifier) {
    return null;
  }

  try {
    const dekBytes = await unwrapDekWithAesKey(account.wrappedKeyByPassword, derived.aesKey);
    return bytesToBase64(dekBytes);
  } catch {
    return null;
  }
}

export async function recoverWithRecoveryKey(
  account: AccountRecord,
  loginId: string,
  recoveryKey: string,
  newPassword: string
): Promise<{ updatedAccount: AccountRecord; dekBase64: string } | null> {
  if (loginId.trim().toLowerCase() !== account.loginIdNormalized) {
    return null;
  }

  const salt = base64ToBytes(account.recoveryKeySalt);
  const derived = await deriveSecretBitsAndKey(normalizeSecretInput(recoveryKey), salt);
  if (derived.verifier !== account.recoveryKeyVerifier) {
    return null;
  }

  try {
    const dekBytes = await unwrapDekWithAesKey(account.wrappedKeyByRecovery, derived.aesKey);
    const newPassSalt = crypto.getRandomValues(new Uint8Array(16));
    const newPassDerived = await deriveSecretBitsAndKey(newPassword, newPassSalt);
    const newWrapped = await wrapDekWithAesKey(dekBytes, newPassDerived.aesKey);

    const updatedAccount: AccountRecord = {
      ...account,
      passwordSalt: bytesToBase64(newPassSalt),
      passwordVerifier: newPassDerived.verifier,
      wrappedKeyByPassword: newWrapped,
      updatedAt: Date.now(),
    };

    return { updatedAccount, dekBase64: bytesToBase64(dekBytes) };
  } catch {
    return null;
  }
}

export async function recoverWithSecurityAnswer(
  account: AccountRecord,
  loginId: string,
  answer: string,
  newPassword: string
): Promise<{ updatedAccount: AccountRecord; dekBase64: string } | null> {
  if (
    loginId.trim().toLowerCase() !== account.loginIdNormalized ||
    !account.securityAnswerSalt ||
    !account.securityAnswerVerifier ||
    !account.wrappedKeyBySecurityAnswer
  ) {
    return null;
  }

  const salt = base64ToBytes(account.securityAnswerSalt);
  const derived = await deriveSecretBitsAndKey(normalizeAnswerInput(answer), salt);
  if (derived.verifier !== account.securityAnswerVerifier) {
    return null;
  }

  try {
    const dekBytes = await unwrapDekWithAesKey(
      account.wrappedKeyBySecurityAnswer,
      derived.aesKey
    );
    const newPassSalt = crypto.getRandomValues(new Uint8Array(16));
    const newPassDerived = await deriveSecretBitsAndKey(newPassword, newPassSalt);
    const newWrapped = await wrapDekWithAesKey(dekBytes, newPassDerived.aesKey);

    const updatedAccount: AccountRecord = {
      ...account,
      passwordSalt: bytesToBase64(newPassSalt),
      passwordVerifier: newPassDerived.verifier,
      wrappedKeyByPassword: newWrapped,
      updatedAt: Date.now(),
    };

    return { updatedAccount, dekBase64: bytesToBase64(dekBytes) };
  } catch {
    return null;
  }
}

export async function changeAccountCredentials(
  account: AccountRecord,
  currentPassword: string,
  updates: { newLoginId?: string; newPassword?: string }
): Promise<AccountRecord | null> {
  const dekBase64 = await authenticateWithPassword(
    account,
    account.loginId,
    currentPassword
  );
  if (!dekBase64) return null;

  let nextAccount: AccountRecord = {
    ...account,
    updatedAt: Date.now(),
  };

  if (updates.newLoginId && updates.newLoginId.trim().length >= 3) {
    nextAccount.loginId = updates.newLoginId.trim();
    nextAccount.loginIdNormalized = updates.newLoginId.trim().toLowerCase();
  }

  if (updates.newPassword && updates.newPassword.length >= 6) {
    const dekBytes = base64ToBytes(dekBase64);
    const newPassSalt = crypto.getRandomValues(new Uint8Array(16));
    const newPassDerived = await deriveSecretBitsAndKey(updates.newPassword, newPassSalt);
    const newWrapped = await wrapDekWithAesKey(dekBytes, newPassDerived.aesKey);
    nextAccount = {
      ...nextAccount,
      passwordSalt: bytesToBase64(newPassSalt),
      passwordVerifier: newPassDerived.verifier,
      wrappedKeyByPassword: newWrapped,
    };
  }

  return nextAccount;
}

export async function updateAccountSecurityQuestion(
  account: AccountRecord,
  dekBase64: string,
  question: string,
  answer: string
): Promise<AccountRecord> {
  const dekBytes = base64ToBytes(dekBase64);
  const ansSaltBytes = crypto.getRandomValues(new Uint8Array(16));
  const ansDerived = await deriveSecretBitsAndKey(
    normalizeAnswerInput(answer),
    ansSaltBytes
  );
  const wrappedByAns = await wrapDekWithAesKey(dekBytes, ansDerived.aesKey);

  return {
    ...account,
    securityQuestion: question.trim(),
    securityAnswerSalt: bytesToBase64(ansSaltBytes),
    securityAnswerVerifier: ansDerived.verifier,
    wrappedKeyBySecurityAnswer: wrappedByAns,
    updatedAt: Date.now(),
  };
}

export async function regenerateAccountRecoveryKey(
  account: AccountRecord,
  dekBase64: string
): Promise<{ updatedAccount: AccountRecord; recoveryKey: string }> {
  const dekBytes = base64ToBytes(dekBase64);
  const recoveryKey = generateRecoveryKey();
  const recoverySaltBytes = crypto.getRandomValues(new Uint8Array(16));
  const recoveryDerived = await deriveSecretBitsAndKey(
    normalizeSecretInput(recoveryKey),
    recoverySaltBytes
  );
  const wrappedByRecovery = await wrapDekWithAesKey(dekBytes, recoveryDerived.aesKey);

  return {
    updatedAccount: {
      ...account,
      recoveryKeySalt: bytesToBase64(recoverySaltBytes),
      recoveryKeyVerifier: recoveryDerived.verifier,
      wrappedKeyByRecovery: wrappedByRecovery,
      updatedAt: Date.now(),
    },
    recoveryKey,
  };
}
