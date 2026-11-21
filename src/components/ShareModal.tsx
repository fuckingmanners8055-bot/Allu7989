import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Link2,
  Lock,
  Share2,
  TableProperties,
  Trash2,
  X,
} from 'lucide-react';
import { CreatedShareLink, ShareableItem } from '../types/vault';
import { createShareLink, revokeShareLink } from '../utils/share';

interface ShareModalProps {
  target: ShareableItem | null;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
];

const VIEW_LIMIT_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Unlimited views', value: null },
  { label: '1 view (Burn after reading)', value: 1 },
  { label: '5 views', value: 5 },
];

export const ShareModal: React.FC<ShareModalProps> = ({ target, onClose }) => {
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [maxViews, setMaxViews] = useState<number | null>(null);
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<CreatedShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokedNotice, setRevokedNotice] = useState(false);

  useEffect(() => {
    if (target) {
      setExpiresInHours(24);
      setMaxViews(null);
      setPasscode('');
      setShowPasscode(false);
      setBusy(false);
      setRevoking(false);
      setError(null);
      setCreatedLink(null);
      setCopied(false);
      setRevokedNotice(false);
    }
  }, [target]);

  if (!target) return null;

  const kindLabel =
    target.kind === 'password'
      ? 'Password Entry'
      : target.kind === 'pdf'
      ? 'PDF Document'
      : target.kind === 'excel'
      ? 'Excel / Ledger'
      : target.kind === 'link'
      ? 'Link / URL'
      : 'Data Record';

  const KindIcon =
    target.kind === 'password'
      ? KeyRound
      : target.kind === 'pdf'
      ? FileText
      : target.kind === 'excel'
      ? FileSpreadsheet
      : target.kind === 'link'
      ? Link2
      : TableProperties;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRevokedNotice(false);
    setBusy(true);
    try {
      const link = await createShareLink(target, {
        expiresInHours,
        maxViews,
        passcode: passcode.trim() || undefined,
      });
      setCreatedLink(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleRevoke = async () => {
    if (!createdLink) return;
    setRevoking(true);
    setError(null);
    try {
      await revokeShareLink(createdLink.id, createdLink.revokeToken);
      setCreatedLink(null);
      setRevokedNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke share link.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Share2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2
              id="share-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              Share Encrypted Link
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close share dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Item summary */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <KindIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {target.item.title}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{kindLabel}</div>
            </div>
          </div>

          {revokedNotice && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300">
              Previous share link has been revoked and deleted from the server.
            </div>
          )}

          {!createdLink ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Link Expiration
                  </label>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option key={opt.hours} value={opt.hours}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    View Limit
                  </label>
                  <select
                    value={maxViews === null ? 'unlimited' : String(maxViews)}
                    onChange={(e) =>
                      setMaxViews(
                        e.target.value === 'unlimited' ? null : Number(e.target.value)
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {VIEW_LIMIT_OPTIONS.map((opt) => (
                      <option
                        key={opt.label}
                        value={opt.value === null ? 'unlimited' : String(opt.value)}
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Optional Share Passcode
                </label>
                <div className="relative">
                  <input
                    type={showPasscode ? 'text' : 'password'}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Leave empty to embed key in link"
                    className="w-full px-3 py-2 pr-10 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  Encrypted in your browser with AES-256-GCM before creating the link. Without a passcode, the decryption key stays inside the URL fragment (#k=...) and is never sent to the server.
                </p>
              </div>

              {error && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50"
                >
                  <Link2 className="w-4 h-4" />
                  <span>{busy ? 'Encrypting & Creating...' : 'Generate Share Link'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Shareable Link Ready
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all">
                  {createdLink.url}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {createdLink.hasPasscode
                      ? 'Passcode required to open'
                      : 'Key embedded in link fragment'}
                  </span>
                </span>
                <span className="font-mono tabular-nums">
                  {createdLink.maxViews === null
                    ? 'Unlimited views'
                    : `${createdLink.maxViews} ${
                        createdLink.maxViews === 1 ? 'view max' : 'views max'
                      }`}
                </span>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Expires on{' '}
                <span className="font-mono">
                  {new Date(createdLink.expiresAt).toLocaleString()}
                </span>
              </div>

              {error && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={revoking}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{revoking ? 'Revoking...' : 'Revoke Link'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreatedLink(null);
                      setCopied(false);
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    New Link
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Copied Link</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Share Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
