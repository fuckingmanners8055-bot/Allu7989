import React, { useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { AccountRecord, StoredVaultEnvelope, VaultData } from '../types/vault';
import {
  decryptVaultData,
  encryptVaultData,
  evaluatePasswordStrength,
  formatBytes,
} from '../utils/crypto';

interface SecurityBackupViewProps {
  account: AccountRecord | null;
  vault: VaultData;
  storageBytes: number;
  onChangeCredentials: (
    currentPass: string,
    updates: { newLoginId?: string; newPassword?: string }
  ) => Promise<boolean>;
  onUpdateSecurityQuestion: (question: string, answer: string) => Promise<void>;
  onRegenerateRecoveryKey: () => Promise<string>;
  onUpdateAutoLock: (minutes: number) => void;
  onImportVaultData: (data: VaultData, mode: 'replace' | 'merge') => void;
  onResetVault: () => Promise<void>;
}

export const SecurityBackupView: React.FC<SecurityBackupViewProps> = ({
  account,
  vault,
  storageBytes,
  onChangeCredentials,
  onUpdateSecurityQuestion,
  onRegenerateRecoveryKey,
  onUpdateAutoLock,
  onImportVaultData,
  onResetVault,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newLoginId, setNewLoginId] = useState(account?.loginId || '');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPassFields, setShowPassFields] = useState(false);
  const [passFeedback, setPassFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [busyPass, setBusyPass] = useState(false);

  const [questionInput, setQuestionInput] = useState(account?.securityQuestion || '');
  const [answerInput, setAnswerInput] = useState('');
  const [questionFeedback, setQuestionFeedback] = useState<string | null>(null);

  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [backupPassword, setBackupPassword] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [pendingEncryptedEnvelope, setPendingEncryptedEnvelope] =
    useState<StoredVaultEnvelope | null>(null);
  const [importDecryptPass, setImportDecryptPass] = useState('');
  const [backupFeedback, setBackupFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [deleteText, setDeleteText] = useState('');

  const strength = evaluatePasswordStrength(newPass);

  const handleChangeCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassFeedback(null);

    const trimmedId = newLoginId.trim();
    const idChanged = Boolean(trimmedId && trimmedId !== account?.loginId);
    const passChanged = Boolean(newPass || confirmPass);

    if (!idChanged && !passChanged) {
      setPassFeedback({
        type: 'error',
        message: 'Edit your Login ID or enter a new Login Password to save changes.',
      });
      return;
    }

    if (idChanged && trimmedId.length < 3) {
      setPassFeedback({
        type: 'error',
        message: 'New Login ID must be at least 3 characters.',
      });
      return;
    }

    if (passChanged) {
      if (newPass.length < 6) {
        setPassFeedback({
          type: 'error',
          message: 'New login password must be at least 6 characters.',
        });
        return;
      }
      if (newPass !== confirmPass) {
        setPassFeedback({
          type: 'error',
          message: 'Password confirmation does not match.',
        });
        return;
      }
    }

    if (!currentPass) {
      setPassFeedback({
        type: 'error',
        message: 'Enter your current login password to confirm changes.',
      });
      return;
    }

    setBusyPass(true);
    try {
      const ok = await onChangeCredentials(currentPass, {
        newLoginId: idChanged ? trimmedId : undefined,
        newPassword: passChanged ? newPass : undefined,
      });
      if (!ok) {
        setPassFeedback({
          type: 'error',
          message: 'Current login password is incorrect.',
        });
        return;
      }
      setPassFeedback({
        type: 'success',
        message:
          idChanged && passChanged
            ? `Login ID updated to "${trimmedId}" and password changed.`
            : idChanged
            ? `Login ID updated to "${trimmedId}".`
            : 'Login password updated successfully.',
      });
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } finally {
      setBusyPass(false);
    }
  };

  const handleSaveSecurityQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim() || !answerInput.trim()) return;
    await onUpdateSecurityQuestion(questionInput.trim(), answerInput.trim());
    setAnswerInput('');
    setQuestionFeedback('Forgot-password security question updated.');
    setTimeout(() => setQuestionFeedback(null), 3000);
  };

  const handleRegenerateKey = async () => {
    const key = await onRegenerateRecoveryKey();
    setNewRecoveryKey(key);
    setCopiedKey(false);
  };

  const triggerDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportEncrypted = async () => {
    setBackupFeedback(null);
    if (!backupPassword || backupPassword.length < 6) {
      setBackupFeedback({
        type: 'error',
        message: 'Enter a backup passphrase (minimum 6 characters) to encrypt the exported file.',
      });
      return;
    }

    const encrypted = await encryptVaultData(vault, backupPassword);
    const envelope: StoredVaultEnvelope = {
      encrypted: true,
      salt: encrypted.salt,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      updatedAt: Date.now(),
    };
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerDownload(
      JSON.stringify(envelope, null, 2),
      `my-thing-encrypted-${dateStamp}.json`
    );
    setBackupPassword('');
    setBackupFeedback({
      type: 'success',
      message: 'Encrypted backup downloaded.',
    });
  };

  const handleExportPlain = () => {
    setBackupFeedback(null);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const payload: StoredVaultEnvelope = {
      encrypted: false,
      plain: vault,
      updatedAt: Date.now(),
    };
    triggerDownload(
      JSON.stringify(payload, null, 2),
      `my-thing-backup-${dateStamp}.json`
    );
    setBackupFeedback({
      type: 'success',
      message: 'Unencrypted JSON backup downloaded.',
    });
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBackupFeedback(null);
    setPendingEncryptedEnvelope(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as StoredVaultEnvelope | VaultData;

      if ('encrypted' in parsed && parsed.encrypted) {
        setPendingEncryptedEnvelope(parsed);
        return;
      }

      const data: VaultData =
        'plain' in parsed && parsed.plain
          ? parsed.plain
          : (parsed as VaultData);

      if (
        !Array.isArray(data.passwords) ||
        !Array.isArray(data.pdfs) ||
        !Array.isArray(data.records)
      ) {
        setBackupFeedback({
          type: 'error',
          message: 'Invalid My thing backup format.',
        });
        return;
      }

      const excelsCount = Array.isArray(data.excels) ? data.excels.length : 0;
      const linksCount = Array.isArray(data.links) ? data.links.length : 0;
      onImportVaultData(
        {
          ...data,
          excels: Array.isArray(data.excels) ? data.excels : [],
          links: Array.isArray(data.links) ? data.links : [],
        },
        importMode
      );
      setBackupFeedback({
        type: 'success',
        message: `Imported ${data.passwords.length} passwords, ${data.pdfs.length} PDFs, ${excelsCount} spreadsheets, ${data.records.length} records, and ${linksCount} links.`,
      });
    } catch {
      setBackupFeedback({
        type: 'error',
        message: 'Could not parse backup file. Ensure it is valid JSON.',
      });
    }
  };

  const handleDecryptAndImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !pendingEncryptedEnvelope?.salt ||
      !pendingEncryptedEnvelope?.iv ||
      !pendingEncryptedEnvelope?.ciphertext
    ) {
      return;
    }

    try {
      const data = await decryptVaultData(
        {
          salt: pendingEncryptedEnvelope.salt,
          iv: pendingEncryptedEnvelope.iv,
          ciphertext: pendingEncryptedEnvelope.ciphertext,
        },
        importDecryptPass
      );
      onImportVaultData(data, importMode);
      setPendingEncryptedEnvelope(null);
      setImportDecryptPass('');
      setBackupFeedback({
        type: 'success',
        message: `Decrypted and imported ${data.passwords.length} passwords, ${data.pdfs.length} PDFs, ${data.excels.length} spreadsheets, ${data.records.length} records, and ${(data.links || []).length} links.`,
      });
    } catch {
      setBackupFeedback({
        type: 'error',
        message: 'Incorrect backup passphrase. Could not decrypt archive.',
      });
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      {/* Section 1: Change Login ID & Password */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Change Login ID & Password</span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Current ID: <span className="font-medium text-slate-800 dark:text-slate-200">{account?.loginId}</span> · AES-256-GCM encrypted
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
            Active
          </span>
        </div>

        <form
          onSubmit={handleChangeCredentials}
          className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Login ID
              </label>
              <input
                type="text"
                value={newLoginId}
                onChange={(e) => setNewLoginId(e.target.value)}
                placeholder="Enter new Login ID"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Current Login Password *
              </label>
              <input
                type={showPassFields ? 'text' : 'password'}
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="Required to confirm changes"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                New Login Password (Optional)
              </label>
              <div className="relative">
                <input
                  type={showPassFields ? 'text' : 'password'}
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="w-full px-3 py-2 pr-9 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassFields((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="Toggle password visibility"
                >
                  {showPassFields ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPass && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Strength: {strength.label} (<span className="font-mono tabular-nums">{strength.entropyBits}</span> bits)
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Confirm New Password
              </label>
              <input
                type={showPassFields ? 'text' : 'password'}
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {passFeedback && (
            <p
              className={`text-xs font-medium ${
                passFeedback.type === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
              role="status"
            >
              {passFeedback.message}
            </p>
          )}

          <button
            type="submit"
            disabled={busyPass}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{busyPass ? 'Saving...' : 'Save ID & Password Changes'}</span>
          </button>
        </form>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Auto-Lock Timeout
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Automatically lock and sign out after inactivity
            </div>
          </div>
          <select
            value={vault.autoLockMinutes}
            onChange={(e) => onUpdateAutoLock(Number(e.target.value))}
            className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          >
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
            <option value={0}>Manual only</option>
          </select>
        </div>
      </section>

      {/* Section 2: Forgot-Password Recovery Options */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Forgot-Password Recovery Options
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure your security question or generate a new 24-character recovery key in case you forget your login password.
          </p>
        </div>

        <form
          onSubmit={handleSaveSecurityQuestion}
          className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Security Question
              </label>
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="e.g. What city were you born in?"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Security Answer
              </label>
              <input
                type="text"
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                placeholder="Enter new answer"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              disabled={!questionInput.trim() || !answerInput.trim()}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              Save Security Question
            </button>

            <button
              type="button"
              onClick={handleRegenerateKey}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Generate New Recovery Key</span>
            </button>
          </div>

          {questionFeedback && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {questionFeedback}
            </p>
          )}
        </form>

        {newRecoveryKey && (
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              New Recovery Key (Previous recovery key is now invalid):
            </div>
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">
                {newRecoveryKey}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(newRecoveryKey);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2000);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0"
              >
                {copiedKey ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section 3: Export & Import Backup */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Backup & Portability
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Export all passwords, PDFs, Excel spreadsheets, and data records into a portable archive file, or restore from a previous backup.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {formatBytes(storageBytes)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Export Archive
            </h3>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                Backup encryption passphrase
              </label>
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Passphrase for exported file"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportEncrypted}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Encrypted</span>
              </button>
              <button
                type="button"
                onClick={handleExportPlain}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Export Unencrypted JSON
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Import Archive
            </h3>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  className="text-blue-600"
                />
                <span>Merge with current items</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="text-blue-600"
                />
                <span>Replace current vault</span>
              </label>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Choose Backup File (.json)</span>
            </button>
          </div>
        </div>

        {pendingEncryptedEnvelope && (
          <form
            onSubmit={handleDecryptAndImport}
            className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              This backup file is encrypted. Enter its passphrase to decrypt and import:
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={importDecryptPass}
                onChange={(e) => setImportDecryptPass(e.target.value)}
                placeholder="Backup passphrase"
                autoFocus
                className="flex-1 min-w-[200px] px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white"
              >
                Decrypt & Import
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingEncryptedEnvelope(null);
                  setImportDecryptPass('');
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {backupFeedback && (
          <p
            className={`text-xs font-medium ${
              backupFeedback.type === 'error'
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
            role="status"
          >
            {backupFeedback.message}
          </p>
        )}
      </section>

      {/* Section 4: Erase Local Vault */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Erase Local Vault & Account
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Permanently remove your account, passwords, PDFs, Excel spreadsheets, and data records from this browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <input
            type="text"
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="w-56 px-3 py-1.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={deleteText !== 'DELETE'}
            onClick={async () => {
              await onResetVault();
              setDeleteText('');
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Erase All Data</span>
          </button>
        </div>
      </section>
    </div>
  );
};
