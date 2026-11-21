import {
  CreatedShareLink,
  DataRecordEntry,
  ExcelEntry,
  LinkEntry,
  PasswordEntry,
  PdfEntry,
  ShareableItem,
} from '../types/vault';

const SHARE_PBKDF2_ITERATIONS = 310_000;

export interface SharedPayload {
  kind: ShareableItem['kind'];
  item: PasswordEntry | PdfEntry | ExcelEntry | DataRecordEntry | LinkEntry;
  sharedAt: number;
}

export interface FetchedShareRecord {
  id: string;
  itemKind: ShareableItem['kind'];
  hasPasscode: boolean;
  salt?: string;
  iv: string;
  ciphertext: string;
  createdAt: number;
  expiresAt: number;
  maxViews: number | null;
  viewsRemaining: number | null;
}

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

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  let padded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4 !== 0) {
    padded += '=';
  }
  return base64ToBytes(padded);
}

async function derivePasscodeAesKey(
  passcode: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: SHARE_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createShareLink(
  shareable: ShareableItem,
  options: {
    expiresInHours: number;
    maxViews: number | null;
    passcode?: string;
  }
): Promise<CreatedShareLink> {
  const payload: SharedPayload = {
    kind: shareable.kind,
    item: shareable.item,
    sharedAt: Date.now(),
  };

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const trimmedPasscode = options.passcode?.trim() || '';
  const hasPasscode = trimmedPasscode.length > 0;

  let aesKey: CryptoKey;
  let saltBase64: string | undefined;
  let keyFragment: string | undefined;

  if (hasPasscode) {
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    saltBase64 = bytesToBase64(saltBytes);
    aesKey = await derivePasscodeAesKey(trimmedPasscode, saltBytes);
  } else {
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    keyFragment = bytesToBase64Url(rawKey);
    aesKey = await crypto.subtle.importKey(
      'raw',
      rawKey as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
  }

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    plaintext
  );

  const response = await fetch('/api/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemKind: shareable.kind,
      hasPasscode,
      salt: saltBase64,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      expiresInHours: options.expiresInHours,
      maxViews: options.maxViews,
    }),
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error || 'Could not generate share link.');
  }

  const created = (await response.json()) as {
    id: string;
    revokeToken: string;
    createdAt: number;
    expiresAt: number;
    maxViews: number | null;
  };

  const baseUrl = `${window.location.origin}/?share=${encodeURIComponent(created.id)}`;
  const url = keyFragment ? `${baseUrl}#k=${keyFragment}` : baseUrl;

  return {
    id: created.id,
    url,
    revokeToken: created.revokeToken,
    itemKind: shareable.kind,
    title: shareable.item.title,
    hasPasscode,
    maxViews: created.maxViews,
    createdAt: created.createdAt,
    expiresAt: created.expiresAt,
  };
}

// Cache fetches per share ID so React StrictMode double-mounts never consume 2 views
const shareFetchCache = new Map<string, Promise<FetchedShareRecord>>();

export function fetchSharedRecord(shareId: string): Promise<FetchedShareRecord> {
  const existing = shareFetchCache.get(shareId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const res = await fetch(`/api/shares/${encodeURIComponent(shareId)}`);
    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(
        errBody?.error || 'This share link was not found, has expired, or reached its view limit.'
      );
    }
    return (await res.json()) as FetchedShareRecord;
  })();

  shareFetchCache.set(shareId, promise);
  return promise;
}

export async function decryptSharedRecord(
  record: FetchedShareRecord,
  secret: string
): Promise<SharedPayload> {
  let aesKey: CryptoKey;

  if (record.hasPasscode) {
    if (!record.salt) {
      throw new Error('Missing key derivation salt.');
    }
    const saltBytes = base64ToBytes(record.salt);
    aesKey = await derivePasscodeAesKey(secret.trim(), saltBytes);
  } else {
    const rawKey = base64UrlToBytes(secret.trim());
    aesKey = await crypto.subtle.importKey(
      'raw',
      rawKey as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
  }

  const ivBytes = base64ToBytes(record.iv);
  const cipherBytes = base64ToBytes(record.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    aesKey,
    cipherBytes as BufferSource
  );

  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as SharedPayload;
  if (!parsed || !parsed.kind || !parsed.item) {
    throw new Error('Decrypted payload is malformed.');
  }
  return parsed;
}

export async function revokeShareLink(id: string, revokeToken: string): Promise<void> {
  const res = await fetch(`/api/shares/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${revokeToken}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error || 'Could not revoke share link.');
  }
}

export function sanitizeExternalUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export async function createShortUrl(params: {
  destinationUrl: string;
  slug?: string;
  expiresInHours: number | null;
}): Promise<{
  slug: string;
  shortUrl: string;
  destinationUrl: string;
  revokeToken: string;
  expiresAt: number | null;
}> {
  const res = await fetch('/api/urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinationUrl: params.destinationUrl,
      slug: params.slug?.trim() || undefined,
      expiresInHours: params.expiresInHours,
    }),
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error || 'Could not create short URL.');
  }

  const data = (await res.json()) as {
    slug: string;
    destinationUrl: string;
    revokeToken: string;
    expiresAt: number | null;
  };

  return {
    slug: data.slug,
    shortUrl: `${window.location.origin}/u/${encodeURIComponent(data.slug)}`,
    destinationUrl: data.destinationUrl,
    revokeToken: data.revokeToken,
    expiresAt: data.expiresAt,
  };
}

export async function revokeShortUrl(slug: string, revokeToken: string): Promise<void> {
  const res = await fetch(`/api/urls/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${revokeToken}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error || 'Could not revoke short URL.');
  }
}

