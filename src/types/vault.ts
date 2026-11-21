export type VaultSection =
  | 'all'
  | 'passwords'
  | 'pdfs'
  | 'excels'
  | 'records'
  | 'links'
  | 'security';

export type PasswordCategory =
  | 'Banking'
  | 'Work'
  | 'Personal'
  | 'Infrastructure'
  | 'Social'
  | 'Shopping'
  | 'Other';

export interface PasswordEntry {
  id: string;
  title: string;
  url: string;
  username: string;
  password: string;
  category: PasswordCategory;
  totpSecret?: string;
  notes?: string;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PdfCategory =
  | 'Tax & Finance'
  | 'Identity & Legal'
  | 'Medical'
  | 'Work'
  | 'Receipts'
  | 'Manuals'
  | 'Other';

export interface PdfEntry {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  category: PdfCategory;
  notes?: string;
  favorite?: boolean;
  dataBase64: string;
  createdAt: number;
  updatedAt: number;
}

export type ExcelCategory =
  | 'Expenses & Budget'
  | 'Invoices & Billing'
  | 'Tax & Accounting'
  | 'Inventory & Sales'
  | 'Payroll'
  | 'Personal'
  | 'Other';

export interface ExcelSheetData {
  name: string;
  headers: string[];
  rows: string[][];
  amountColumnIndices?: number[];
}

export interface ExcelEntry {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  category: ExcelCategory;
  currency: string;
  sheets: ExcelSheetData[];
  notes?: string;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type RecordTemplate =
  | 'Note'
  | 'Identity'
  | 'Bank & Card'
  | 'API & License'
  | 'Custom';

export interface RecordField {
  id: string;
  label: string;
  value: string;
  sensitive: boolean;
}

export interface DataRecordEntry {
  id: string;
  title: string;
  template: RecordTemplate;
  fields: RecordField[];
  notes?: string;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type LinkCategory =
  | 'Bookmarks'
  | 'Work & Tools'
  | 'Finance & Govt'
  | 'Docs & Resources'
  | 'Shopping'
  | 'Media'
  | 'Other';

export interface LinkEntry {
  id: string;
  title: string;
  url: string;
  shortSlug?: string;
  shortUrl?: string;
  shortRevokeToken?: string;
  shortExpiresAt?: number | null;
  category: LinkCategory;
  tags?: string[];
  description?: string;
  notes?: string;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VaultData {
  passwords: PasswordEntry[];
  pdfs: PdfEntry[];
  excels: ExcelEntry[];
  records: DataRecordEntry[];
  links?: LinkEntry[];
  autoLockMinutes: number;
}

export interface StoredVaultEnvelope {
  encrypted: boolean;
  salt?: string;
  iv?: string;
  ciphertext?: string;
  plain?: VaultData;
  updatedAt: number;
}

export interface WrappedKeyPayload {
  iv: string;
  ciphertext: string;
}

export interface AccountRecord {
  loginId: string;
  loginIdNormalized: string;
  passwordSalt: string;
  passwordVerifier: string;
  wrappedKeyByPassword: WrappedKeyPayload;
  recoveryKeySalt: string;
  recoveryKeyVerifier: string;
  wrappedKeyByRecovery: WrappedKeyPayload;
  securityQuestion?: string;
  securityAnswerSalt?: string;
  securityAnswerVerifier?: string;
  wrappedKeyBySecurityAnswer?: WrappedKeyPayload;
  createdAt: number;
  updatedAt: number;
}

export type ActiveItemRef =
  | { type: 'password'; id: string }
  | { type: 'pdf'; id: string }
  | { type: 'excel'; id: string }
  | { type: 'record'; id: string }
  | { type: 'link'; id: string };

export type ShareableItem =
  | { kind: 'password'; item: PasswordEntry }
  | { kind: 'pdf'; item: PdfEntry }
  | { kind: 'excel'; item: ExcelEntry }
  | { kind: 'record'; item: DataRecordEntry }
  | { kind: 'link'; item: LinkEntry };

export interface CreatedShareLink {
  id: string;
  url: string;
  revokeToken: string;
  itemKind: ShareableItem['kind'];
  title: string;
  hasPasscode: boolean;
  maxViews: number | null;
  createdAt: number;
  expiresAt: number;
}

