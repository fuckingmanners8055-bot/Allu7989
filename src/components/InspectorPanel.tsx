import React, { useEffect, useState } from 'react';
import {
  Calculator,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Link2,
  Pencil,
  Share2,
  Star,
  TableProperties,
  Trash2,
  X,
} from 'lucide-react';
import {
  ActiveItemRef,
  DataRecordEntry,
  ExcelEntry,
  LinkEntry,
  PasswordEntry,
  PdfEntry,
  ShareableItem,
} from '../types/vault';
import {
  evaluatePasswordStrength,
  formatBytes,
  formatDate,
} from '../utils/crypto';
import { sanitizeExternalUrl } from '../utils/share';
import {
  computeEntryGrandTotal,
  computeSheetSummaries,
  exportSheetsToXlsx,
  formatAmount,
} from '../utils/spreadsheet';
import { downloadBase64Pdf } from '../utils/storage';

interface InspectorPanelProps {
  activeItem: ActiveItemRef | null;
  passwords: PasswordEntry[];
  pdfs: PdfEntry[];
  excels: ExcelEntry[];
  records: DataRecordEntry[];
  links: LinkEntry[];
  onClose: () => void;
  onShareItem: (item: ShareableItem) => void;
  onEditPassword: (entry: PasswordEntry) => void;
  onDeletePassword: (id: string) => void;
  onToggleFavoritePassword: (id: string) => void;
  onEditPdf: (entry: PdfEntry) => void;
  onDeletePdf: (id: string) => void;
  onOpenPdfViewer: (entry: PdfEntry) => void;
  onToggleFavoritePdf: (id: string) => void;
  onEditExcel: (entry: ExcelEntry) => void;
  onDeleteExcel: (id: string) => void;
  onOpenExcelViewer: (entry: ExcelEntry) => void;
  onToggleFavoriteExcel: (id: string) => void;
  onEditRecord: (entry: DataRecordEntry) => void;
  onDeleteRecord: (id: string) => void;
  onToggleFavoriteRecord: (id: string) => void;
  onEditLink: (entry: LinkEntry) => void;
  onDeleteLink: (id: string) => void;
  onToggleFavoriteLink: (id: string) => void;
  onRevokeShortUrl: (entry: LinkEntry) => Promise<void>;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  activeItem,
  passwords,
  pdfs,
  excels,
  records,
  links,
  onClose,
  onShareItem,
  onEditPassword,
  onDeletePassword,
  onToggleFavoritePassword,
  onEditPdf,
  onDeletePdf,
  onOpenPdfViewer,
  onToggleFavoritePdf,
  onEditExcel,
  onDeleteExcel,
  onOpenExcelViewer,
  onToggleFavoriteExcel,
  onEditRecord,
  onDeleteRecord,
  onToggleFavoriteRecord,
  onEditLink,
  onDeleteLink,
  onToggleFavoriteLink,
  onRevokeShortUrl,
}) => {
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setRevealedKeys({});
    setCopiedKey(null);
    setConfirmDelete(false);
  }, [activeItem?.type, activeItem?.id]);

  if (!activeItem) return null;

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  let body: React.ReactNode = null;

  if (activeItem.type === 'password') {
    const item = passwords.find((p) => p.id === activeItem.id);
    if (!item) return null;
    const strength = evaluatePasswordStrength(item.password);
    const isPasswordShown = Boolean(revealedKeys['password']);
    const isTotpShown = Boolean(revealedKeys['totp']);

    const safeHref =
      item.url && /^https?:\/\//i.test(item.url)
        ? item.url
        : item.url
        ? `https://${item.url}`
        : null;

    body = (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {item.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onShareItem({ kind: 'password', item })}
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Share encrypted link"
              title="Create share link"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleFavoritePassword(item.id)}
              className={`p-1.5 rounded-md transition-colors ${
                item.favorite
                  ? 'text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              aria-label={item.favorite ? 'Remove from favorites' : 'Pin to favorites'}
            >
              <Star className={`w-4 h-4 ${item.favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>{item.category}</span>
            <span aria-hidden="true"> · </span>
            <span>Updated {formatDate(item.updatedAt)}</span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Username / Email
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-sm text-slate-900 dark:text-slate-100 truncate">
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
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                <span>Password</span>
                <span className="font-mono tabular-nums">
                  {strength.label} · {strength.entropyBits} bits
                </span>
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

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 space-y-1 font-mono tabular-nums">
            <div>Created: {formatDate(item.createdAt)}</div>
            <div>Modified: {formatDate(item.updatedAt)}</div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={() => onEditPassword(item)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Entry</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-red-600 dark:text-red-400">
                Delete this password permanently?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDeletePassword(item.id)}
                  className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } else if (activeItem.type === 'pdf') {
    const item = pdfs.find((p) => p.id === activeItem.id);
    if (!item) return null;

    body = (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {item.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onShareItem({ kind: 'pdf', item })}
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Share encrypted link"
              title="Create share link"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleFavoritePdf(item.id)}
              className={`p-1.5 rounded-md transition-colors ${
                item.favorite
                  ? 'text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              aria-label={item.favorite ? 'Remove from favorites' : 'Pin to favorites'}
            >
              <Star className={`w-4 h-4 ${item.favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>{item.category}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">{formatBytes(item.fileSize)}</span>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-start gap-3">
              <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 break-all">
                  {item.fileName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  PDF Document ·{' '}
                  <span className="font-mono tabular-nums">{formatBytes(item.fileSize)}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenPdfViewer(item)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View PDF</span>
              </button>
              <button
                type="button"
                onClick={() => downloadBase64Pdf(item.dataBase64, item.fileName)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>

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

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 space-y-1 font-mono tabular-nums">
            <div>Uploaded: {formatDate(item.createdAt)}</div>
            <div>Modified: {formatDate(item.updatedAt)}</div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={() => onEditPdf(item)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-red-600 dark:text-red-400">
                Delete this PDF document permanently?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDeletePdf(item.id)}
                  className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } else if (activeItem.type === 'excel') {
    const item = excels.find((x) => x.id === activeItem.id);
    if (!item) return null;
    const grandTotal = computeEntryGrandTotal(item.sheets);
    const firstSummary = item.sheets[0]
      ? computeSheetSummaries(item.sheets[0])
      : { columns: [], activeAmountIndices: [], grandTotal: 0 };

    body = (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {item.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onShareItem({ kind: 'excel', item })}
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Share encrypted link"
              title="Create share link"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleFavoriteExcel(item.id)}
              className={`p-1.5 rounded-md transition-colors ${
                item.favorite
                  ? 'text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              aria-label={item.favorite ? 'Remove from favorites' : 'Pin to favorites'}
            >
              <Star className={`w-4 h-4 ${item.favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>{item.category}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">
              {item.sheets.length} {item.sheets.length === 1 ? 'sheet' : 'sheets'}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">{formatBytes(item.fileSize)}</span>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Calculated Grand Total</span>
              </span>
              <span className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatAmount(grandTotal, item.currency)}
              </span>
            </div>

            {firstSummary.columns.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                {firstSummary.columns.map((col) => (
                  <div
                    key={col.colIndex}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-slate-600 dark:text-slate-400 truncate">
                      {col.header} ({col.numericCount} rows)
                    </span>
                    <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {firstSummary.activeAmountIndices.includes(col.colIndex)
                        ? formatAmount(col.sum, item.currency)
                        : new Intl.NumberFormat('en-IN', {
                            maximumFractionDigits: 2,
                          }).format(col.sum)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenExcelViewer(item)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Open & Edit</span>
              </button>
              <button
                type="button"
                onClick={() => exportSheetsToXlsx(item.sheets, item.fileName)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export .XLSX</span>
              </button>
            </div>
          </div>

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

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 space-y-1 font-mono tabular-nums">
            <div>File: {item.fileName}</div>
            <div>Created: {formatDate(item.createdAt)}</div>
            <div>Modified: {formatDate(item.updatedAt)}</div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={() => onEditExcel(item)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-red-600 dark:text-red-400">
                Delete this Excel spreadsheet permanently?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDeleteExcel(item.id)}
                  className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } else if (activeItem.type === 'record') {
    const item = records.find((r) => r.id === activeItem.id);
    if (!item) return null;

    body = (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <TableProperties className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {item.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onShareItem({ kind: 'record', item })}
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Share encrypted link"
              title="Create share link"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleFavoriteRecord(item.id)}
              className={`p-1.5 rounded-md transition-colors ${
                item.favorite
                  ? 'text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              aria-label={item.favorite ? 'Remove from favorites' : 'Pin to favorites'}
            >
              <Star className={`w-4 h-4 ${item.favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>{item.template}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">{item.fields.length} fields</span>
            <span aria-hidden="true"> · </span>
            <span>Updated {formatDate(item.updatedAt)}</span>
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

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 space-y-1 font-mono tabular-nums">
            <div>Created: {formatDate(item.createdAt)}</div>
            <div>Modified: {formatDate(item.updatedAt)}</div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={() => onEditRecord(item)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Record</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-red-600 dark:text-red-400">
                Delete this data record permanently?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDeleteRecord(item.id)}
                  className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } else if (activeItem.type === 'link') {
    const item = links.find((l) => l.id === activeItem.id);
    if (!item) return null;
    const safeHref = sanitizeExternalUrl(item.url);

    body = (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {item.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onShareItem({ kind: 'link', item })}
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Share encrypted link"
              title="Create share link"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleFavoriteLink(item.id)}
              className={`p-1.5 rounded-md transition-colors ${
                item.favorite
                  ? 'text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              aria-label={item.favorite ? 'Remove from favorites' : 'Pin to favorites'}
            >
              <Star className={`w-4 h-4 ${item.favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>{item.category}</span>
            <span aria-hidden="true"> · </span>
            <span>Updated {formatDate(item.updatedAt)}</span>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Destination URL
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
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

          {item.shortUrl && (
            <div className="p-3.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-blue-800 dark:text-blue-300">
                  Created Short URL
                </span>
                {item.shortRevokeToken && (
                  <button
                    type="button"
                    onClick={() => void onRevokeShortUrl(item)}
                    className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
                  >
                    Revoke
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <a
                  href={item.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-blue-700 dark:text-blue-300 hover:underline truncate flex items-center gap-1"
                >
                  <span className="truncate">{item.shortUrl}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                <button
                  type="button"
                  onClick={() => copyValue('short-url', item.shortUrl!)}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 shrink-0"
                  aria-label="Copy short URL"
                >
                  {copiedKey === 'short-url' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              {item.shortExpiresAt && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  Expires {new Date(item.shortExpiresAt).toLocaleString()}
                </div>
              )}
            </div>
          )}

          {item.description && (
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Description
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{item.description}</p>
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

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 space-y-1 font-mono tabular-nums">
            <div>Created: {formatDate(item.createdAt)}</div>
            <div>Modified: {formatDate(item.updatedAt)}</div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={() => onEditLink(item)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Link</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-red-600 dark:text-red-400">
                Delete this saved link permanently?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDeleteLink(item.id)}
                  className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className="hidden xl:flex flex-col w-96 shrink-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-[calc(100vh-4rem)] sticky top-16">
        {body}
      </aside>

      <div className="fixed inset-0 z-40 xl:hidden flex justify-end">
        <div
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
          onClick={onClose}
          aria-hidden="true"
        />
        <aside className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full">
          {body}
        </aside>
      </div>
    </>
  );
};
