import React, { useEffect, useState } from 'react';
import { Check, Copy, Link2, Sparkles, X } from 'lucide-react';
import { LinkCategory, LinkEntry } from '../types/vault';
import { createId } from '../utils/crypto';
import { createShortUrl, sanitizeExternalUrl } from '../utils/share';

const LINK_CATEGORIES: LinkCategory[] = [
  'Bookmarks',
  'Work & Tools',
  'Finance & Govt',
  'Docs & Resources',
  'Shopping',
  'Media',
  'Other',
];

const EXPIRY_OPTIONS: { label: string; hours: number | null }[] = [
  { label: 'Never expires', hours: null },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
];

interface LinkModalProps {
  isOpen: boolean;
  initialEntry?: LinkEntry | null;
  onClose: () => void;
  onSave: (entry: LinkEntry) => void;
}

export const LinkModal: React.FC<LinkModalProps> = ({
  isOpen,
  initialEntry,
  onClose,
  onSave,
}) => {
  const [createShort, setCreateShort] = useState(true);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [expiresInHours, setExpiresInHours] = useState<number | null>(null);
  const [category, setCategory] = useState<LinkCategory>('Bookmarks');
  const [tagsInput, setTagsInput] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);

  const [busy, setBusy] = useState(false);
  const [copiedShort, setCopiedShort] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialEntry) {
        setCreateShort(Boolean(initialEntry.shortUrl));
        setTitle(initialEntry.title);
        setUrl(initialEntry.url);
        setCustomSlug(initialEntry.shortSlug || '');
        setExpiresInHours(null);
        setCategory(initialEntry.category);
        setTagsInput((initialEntry.tags || []).join(', '));
        setDescription(initialEntry.description || '');
        setNotes(initialEntry.notes || '');
        setFavorite(Boolean(initialEntry.favorite));
      } else {
        setCreateShort(true);
        setTitle('');
        setUrl('');
        setCustomSlug('');
        setExpiresInHours(null);
        setCategory('Bookmarks');
        setTagsInput('');
        setDescription('');
        setNotes('');
        setFavorite(false);
      }
      setBusy(false);
      setCopiedShort(false);
      setError(null);
    }
  }, [isOpen, initialEntry]);

  if (!isOpen) return null;

  const hasExistingShort = Boolean(initialEntry?.shortUrl);
  const previewSlug = customSlug.trim().toLowerCase() || '<auto>';
  const previewShortUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/u/${previewSlug}`
      : `/u/${previewSlug}`;

  const handleCopyShort = async () => {
    if (!initialEntry?.shortUrl) return;
    try {
      await navigator.clipboard.writeText(initialEntry.shortUrl);
      setCopiedShort(true);
      setTimeout(() => setCopiedShort(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    const normalizedUrl = sanitizeExternalUrl(url);
    if (!normalizedUrl) {
      setError('Enter a valid http:// or https:// URL.');
      return;
    }

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    let shortFields: Pick<
      LinkEntry,
      'shortSlug' | 'shortUrl' | 'shortRevokeToken' | 'shortExpiresAt'
    > = {
      shortSlug: initialEntry?.shortSlug,
      shortUrl: initialEntry?.shortUrl,
      shortRevokeToken: initialEntry?.shortRevokeToken,
      shortExpiresAt: initialEntry?.shortExpiresAt,
    };

    if (createShort && !hasExistingShort) {
      setBusy(true);
      try {
        const created = await createShortUrl({
          destinationUrl: normalizedUrl,
          slug: customSlug.trim() || undefined,
          expiresInHours,
        });
        shortFields = {
          shortSlug: created.slug,
          shortUrl: created.shortUrl,
          shortRevokeToken: created.revokeToken,
          shortExpiresAt: created.expiresAt,
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to create short URL.');
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    const now = Date.now();
    const entry: LinkEntry = {
      id: initialEntry?.id || createId('lnk'),
      title: title.trim(),
      url: normalizedUrl,
      ...shortFields,
      category,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
      favorite,
      createdAt: initialEntry?.createdAt || now,
      updatedAt: now,
    };

    onSave(entry);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-modal-title"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2
              id="link-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {initialEntry ? 'Edit URL Entry' : 'Create / Store URL'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {!hasExistingShort && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setCreateShort(true)}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  createShort
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Create Short URL</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateShort(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  !createShort
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Store URL Only
              </button>
            </div>
          )}

          {hasExistingShort && initialEntry?.shortUrl && (
            <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-1.5">
              <div className="text-xs font-medium text-blue-800 dark:text-blue-300">
                Active Short URL
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-900 dark:text-slate-100 truncate">
                  {initialEntry.shortUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyShort}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0"
                >
                  {copiedShort ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Income Tax Portal, Project Docs"
                autoFocus
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as LinkCategory)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {LINK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {createShort ? 'Destination URL *' : 'URL / Web Link *'}
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/resource"
              className="w-full px-3 py-2 font-mono text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {createShort && !hasExistingShort && (
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Custom Alias (Optional)
                  </label>
                  <input
                    type="text"
                    value={customSlug}
                    onChange={(e) =>
                      setCustomSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))
                    }
                    placeholder="e.g. tax-portal"
                    maxLength={40}
                    className="w-full px-3 py-1.5 font-mono text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    URL Expiration
                  </label>
                  <select
                    value={expiresInHours === null ? 'never' : String(expiresInHours)}
                    onChange={(e) =>
                      setExpiresInHours(
                        e.target.value === 'never' ? null : Number(e.target.value)
                      )
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option
                        key={opt.label}
                        value={opt.hours === null ? 'never' : String(opt.hours)}
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Created URL:{' '}
                <span className="font-mono text-slate-700 dark:text-slate-300 break-all">
                  {previewShortUrl}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this URL is used for"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Tags (Optional, comma-separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. tax, portal, invoice"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reference info, instructions, or related IDs..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <span>Pin to favorites</span>
          </label>

          {error && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap"
            >
              {busy
                ? 'Creating URL...'
                : initialEntry
                ? 'Save Changes'
                : createShort
                ? 'Create URL & Save'
                : 'Save URL'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
