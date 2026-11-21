import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calculator,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FolderLock,
  KeyRound,
  Link2,
  Lock,
  Moon,
  ShieldAlert,
  Sun,
  TableProperties,
} from 'lucide-react';
import {
  DataRecordEntry,
  ExcelEntry,
  LinkEntry,
  PasswordEntry,
  PdfEntry,
} from '../types/vault';
import { formatBytes, formatDate } from '../utils/crypto';
import {
  decryptSharedRecord,
  FetchedShareRecord,
  fetchSharedRecord,
  sanitizeExternalUrl,
  SharedPayload,
} from '../utils/share';
import {
  colIndexToLetter,
  computeSheetSummaries,
  evaluateCellDisplay,
  exportSheetsToXlsx,
  exportSheetToCsv,
  formatAmount,
} from '../utils/spreadsheet';
import { base64ToPdfBlobUrl, downloadBase64Pdf } from '../utils/storage';

interface SharedItemViewProps {
  shareId: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onExitShare: () => void;
}

export const SharedItemView: React.FC<SharedItemViewProps> = ({
  shareId,
  darkMode,
  onToggleDarkMode,
  onExitShare,
}) => {
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<FetchedShareRecord | null>(null);
  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecord(null);
    setPayload(null);

    (async () => {
      try {
        const fetched = await fetchSharedRecord(shareId);
        if (cancelled) return;
        setRecord(fetched);

        if (!fetched.hasPasscode) {
          const hash = window.location.hash || '';
          const match = hash.match(/k=([A-Za-z0-9_-]+)/);
          const keySecret = match?.[1];
          if (!keySecret) {
            setError('Decryption key is missing from this share link URL.');
            return;
          }
          const decrypted = await decryptSharedRecord(fetched, keySecret);
          if (!cancelled) {
            setPayload(decrypted);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'This share link could not be loaded or has expired.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareId]);

  useEffect(() => {
    if (payload?.kind === 'pdf') {
      const pdf = payload.item as PdfEntry;
      const url = base64ToPdfBlobUrl(pdf.dataBase64);
      setPdfBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    setPdfBlobUrl(null);
    return undefined;
  }, [payload]);

  const excelSummary = useMemo(() => {
    if (payload?.kind !== 'excel') return null;
    const excel = payload.item as ExcelEntry;
    const sheet = excel.sheets[activeSheetIdx] || excel.sheets[0];
    if (!sheet) return null;
    return {
      sheet,
      summary: computeSheetSummaries(sheet),
    };
  }, [payload, activeSheetIdx]);

  const handleUnlockWithPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    if (!passcodeInput.trim()) {
      setUnlockError('Enter the share passcode.');
      return;
    }

    setUnlocking(true);
    setUnlockError(null);
    try {
      const decrypted = await decryptSharedRecord(record, passcodeInput);
      setPayload(decrypted);
    } catch {
      setUnlockError('Incorrect passcode. Unable to decrypt shared item.');
    } finally {
      setUnlocking(false);
    }
  };

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    } catch {
      // ignore
    }
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="h-16 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shrink-0">
            <FolderLock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              My thing · Shared Item
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              End-to-end encrypted read-only share
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onExitShare}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Open My Vault</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center">
        {loading && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Fetching and decrypting shared item...
          </div>
        )}

        {!loading && error && (
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-4">
            <div className="w-10 h-10 mx-auto rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Share Link Unavailable
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
            </div>
            <button
              type="button"
              onClick={onExitShare}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500"
            >
              Go to Vault Sign In
            </button>
          </div>
        )}

        {!loading && !error && record && !payload && record.hasPasscode && (
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Passcode Required
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter the share passcode to decrypt this item in your browser.
                </p>
              </div>
            </div>

            <form onSubmit={handleUnlockWithPasscode} className="space-y-4">
              <div className="relative">
                <input
                  type={showPasscode ? 'text' : 'password'}
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="Enter share passcode"
                  autoFocus
                  className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                >
                  {showPasscode ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {unlockError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                  {unlockError}
                </p>
              )}

              <button
                type="submit"
                disabled={unlocking}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50"
              >
                {unlocking ? 'Decrypting...' : 'Unlock Shared Item'}
              </button>
            </form>
          </div>
        )}

        {!loading && !error && record && payload && (
          <div className="w-full max-w-4xl space-y-4">
            {/* Metadata bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 px-1">
              <span>
                Shared on <span className="font-mono">{formatDate(payload.sharedAt)}</span>
              </span>
              <span className="font-mono tabular-nums">
                Expires {new Date(record.expiresAt).toLocaleString()}
                {record.viewsRemaining !== null &&
                  ` · ${record.viewsRemaining} ${
                    record.viewsRemaining === 1 ? 'view' : 'views'
                  } remaining after this`}
              </span>
            </div>

            {payload.kind === 'password' && (() => {
              const item = payload.item as PasswordEntry;
              const safeHref = sanitizeExternalUrl(item.url);
              const isPasswordShown = Boolean(revealedKeys['password']);
              const isTotpShown = Boolean(revealedKeys['totp']);

              return (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div>
                      <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Password Entry · {item.category}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Username / Email
                      </div>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-sm text-slate-900 dark:text-slate-100 break-all">
                          {item.username || 'Not specified'}
                        </span>
                        {item.username && (
                          <button
                            type="button"
                            onClick={() => copyValue('username', item.username)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                            aria-label="Copy username"
                          >
                            {copiedKey === 'username' ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Password
                      </div>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="font-mono text-sm text-slate-900 dark:text-slate-100 break-all">
                          {isPasswordShown ? item.password : '••••••••••••••••'}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleReveal('password')}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            aria-label={isPasswordShown ? 'Hide password' : 'Reveal password'}
                          >
                            {isPasswordShown ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyValue('password', item.password)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            aria-label="Copy password"
                          >
                            {copiedKey === 'password' ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {safeHref && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Website URL
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          <a
                            href={safeHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-1.5"
                          >
                            <span className="truncate">{item.url}</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                          <button
                            type="button"
                            onClick={() => copyValue('url', item.url)}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                            aria-label="Copy URL"
                          >
                            {copiedKey === 'url' ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {item.totpSecret && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          2FA Secret / Recovery Code
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          <span className="font-mono text-sm text-slate-900 dark:text-slate-100 break-all">
                            {isTotpShown ? item.totpSecret : '••••••••••••'}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleReveal('totp')}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              aria-label={isTotpShown ? 'Hide 2FA secret' : 'Reveal 2FA secret'}
                            >
                              {isTotpShown ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyValue('totp', item.totpSecret!)}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              aria-label="Copy 2FA secret"
                            >
                              {copiedKey === 'totp' ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {item.notes && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Notes
                        </div>
                        <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {item.notes}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {payload.kind === 'pdf' && (() => {
              const item = payload.item as PdfEntry;
              return (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {item.title}
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {item.fileName} · {item.category} ·{' '}
                          <span className="font-mono tabular-nums">
                            {formatBytes(item.fileSize)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => downloadBase64Pdf(item.dataBase64, item.fileName)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                  </div>

                  {item.notes && (
                    <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                      {item.notes}
                    </div>
                  )}

                  <div className="h-[70vh] bg-slate-100 dark:bg-slate-950">
                    {pdfBlobUrl ? (
                      <iframe
                        src={pdfBlobUrl}
                        title={item.title}
                        className="w-full h-full border-0"
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                        Loading PDF preview...
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {payload.kind === 'excel' && excelSummary && (() => {
              const item = payload.item as ExcelEntry;
              const { sheet, summary } = excelSummary;
              return (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {item.title}
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {item.fileName} · {item.category} · {sheet.rows.length} rows
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => exportSheetsToXlsx(item.sheets, item.fileName)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export .XLSX</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => exportSheetToCsv(sheet, item.fileName)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        .CSV
                      </button>
                    </div>
                  </div>

                  <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Calculated Total Amount
                        </div>
                        <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {formatAmount(summary.grandTotal, item.currency)}
                        </div>
                      </div>
                    </div>

                    {item.sheets.length > 1 && (
                      <div className="flex items-center gap-1 overflow-x-auto">
                        {item.sheets.map((s, idx) => (
                          <button
                            key={`${s.name}-${idx}`}
                            type="button"
                            onClick={() => setActiveSheetIdx(idx)}
                            className={`px-3 py-1 rounded-md text-xs font-medium ${
                              idx === activeSheetIdx
                                ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="overflow-auto max-h-[60vh]">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950">
                        <tr>
                          <th className="w-10 px-2 py-1.5 border-b border-r border-slate-200 dark:border-slate-800 font-mono text-slate-400">
                            #
                          </th>
                          {sheet.headers.map((hdr, cIdx) => (
                            <th
                              key={`hdr-${cIdx}`}
                              className="min-w-[120px] px-3 py-2 border-b border-r border-slate-200 dark:border-slate-800 text-left font-semibold text-slate-800 dark:text-slate-100"
                            >
                              <div className="text-[10px] font-mono text-slate-400">
                                {colIndexToLetter(cIdx)}
                              </div>
                              {hdr}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {sheet.rows.map((row, rIdx) => (
                          <tr key={`row-${rIdx}`}>
                            <td className="px-2 py-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono text-slate-400">
                              {rIdx + 1}
                            </td>
                            {sheet.headers.map((_, cIdx) => {
                              const evaluated = evaluateCellDisplay(
                                row[cIdx] ?? '',
                                sheet.rows,
                                rIdx,
                                cIdx
                              );
                              const isAmountCol = summary.activeAmountIndices.includes(cIdx);
                              const display =
                                evaluated.numeric !== null && isAmountCol
                                  ? formatAmount(evaluated.numeric, item.currency)
                                  : evaluated.display;
                              return (
                                <td
                                  key={`c-${rIdx}-${cIdx}`}
                                  className={`px-3 py-2 border-r border-slate-200 dark:border-slate-800 ${
                                    evaluated.numeric !== null
                                      ? 'text-right font-mono tabular-nums text-slate-900 dark:text-slate-100'
                                      : 'text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {display || '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {payload.kind === 'record' && (() => {
              const item = payload.item as DataRecordEntry;
              return (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <TableProperties className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div>
                      <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.template} · {item.fields.length} fields
                      </p>
                    </div>
                  </div>

                  {item.fields.length > 0 && (
                    <div className="space-y-3">
                      {item.fields.map((field) => {
                        const isShown = !field.sensitive || Boolean(revealedKeys[field.id]);
                        return (
                          <div key={field.id}>
                            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                              {field.label || 'Field'}
                            </div>
                            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                              <span
                                className={`text-sm text-slate-900 dark:text-slate-100 break-all ${
                                  field.sensitive ? 'font-mono' : ''
                                }`}
                              >
                                {isShown ? field.value || '—' : '••••••••••••'}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {field.sensitive && (
                                  <button
                                    type="button"
                                    onClick={() => toggleReveal(field.id)}
                                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    aria-label={isShown ? 'Hide value' : 'Reveal value'}
                                  >
                                    {isShown ? (
                                      <EyeOff className="w-4 h-4" />
                                    ) : (
                                      <Eye className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                                {field.value && (
                                  <button
                                    type="button"
                                    onClick={() => copyValue(field.id, field.value)}
                                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    aria-label={`Copy ${field.label}`}
                                  >
                                    {copiedKey === field.id ? (
                                      <Check className="w-4 h-4 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {item.notes && (
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Notes
                      </div>
                      <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {item.notes}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {payload.kind === 'link' && (() => {
              const item = payload.item as LinkEntry;
              const safeHref = sanitizeExternalUrl(item.url);
              return (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <Link2 className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div>
                      <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Saved Link · {item.category}
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      URL
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      {safeHref ? (
                        <a
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-1.5"
                        >
                          <span className="truncate">{item.url}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-sm font-mono text-slate-900 dark:text-slate-100 truncate">
                          {item.url}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => copyValue('link-url', item.url)}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                        aria-label="Copy URL"
                      >
                        {copiedKey === 'link-url' ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {item.description && (
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Description
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {item.description}
                      </p>
                    </div>
                  )}

                  {item.tags && item.tags.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                        Tags
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.notes && (
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Notes
                      </div>
                      <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {item.notes}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
};
