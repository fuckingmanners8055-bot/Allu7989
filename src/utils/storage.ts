import { AccountRecord, StoredVaultEnvelope, VaultData } from '../types/vault';

const DB_NAME = 'strongbox_vault_db';
const DB_VERSION = 1;
const STORE_NAME = 'vault_store';
const PRIMARY_KEY = 'primary_vault';
const ACCOUNT_KEY = 'vault_account';

export const EMPTY_VAULT: VaultData = {
  passwords: [],
  pdfs: [],
  excels: [],
  records: [],
  links: [],
  autoLockMinutes: 15,
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

export async function loadVaultEnvelope(): Promise<StoredVaultEnvelope | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(PRIMARY_KEY);

    req.onsuccess = () => {
      resolve((req.result as StoredVaultEnvelope | undefined) ?? null);
    };
    req.onerror = () => reject(req.error || new Error('Failed to read vault'));
    tx.oncomplete = () => db.close();
  });
}

export async function saveVaultEnvelope(envelope: StoredVaultEnvelope): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(envelope, PRIMARY_KEY);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to save vault'));
    tx.oncomplete = () => db.close();
  });
}

export async function loadAccountRecord(): Promise<AccountRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(ACCOUNT_KEY);

    req.onsuccess = () => {
      resolve((req.result as AccountRecord | undefined) ?? null);
    };
    req.onerror = () => reject(req.error || new Error('Failed to read account'));
    tx.oncomplete = () => db.close();
  });
}

export async function saveAccountRecord(account: AccountRecord): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(account, ACCOUNT_KEY);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to save account'));
    tx.oncomplete = () => db.close();
  });
}

export async function clearVaultStorage(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(PRIMARY_KEY);
    store.delete(ACCOUNT_KEY);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error || new Error('Failed to clear vault'));
  });
}

export function estimateVaultBytes(data: VaultData): number {
  const json = JSON.stringify(data);
  return new Blob([json]).size;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function base64ToPdfBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

export function downloadBase64Pdf(base64: string, fileName: string): void {
  const url = base64ToPdfBlobUrl(base64);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
