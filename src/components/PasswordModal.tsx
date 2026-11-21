import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, RefreshCw, Wand2, X } from 'lucide-react';
import { PasswordCategory, PasswordEntry } from '../types/vault';
import {
  createId,
  evaluatePasswordStrength,
  generateSecurePassword,
} from '../utils/crypto';

const CATEGORIES: PasswordCategory[] = [
  'Personal',
  'Work',
  'Banking',
  'Infrastructure',
  'Social',
  'Shopping',
  'Other',
];

interface PasswordModalProps {
  isOpen: boolean;
  initialEntry?: PasswordEntry | null;
  onClose: () => void;
  onSave: (entry: PasswordEntry) => void;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  initialEntry,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState<PasswordCategory>('Personal');
  const [totpSecret, setTotpSecret] = useState('');
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [genLength, setGenLength] = useState(20);
  const [genUpper, setGenUpper] = useState(true);
  const [genLower, setGenLower] = useState(true);
  const [genNumbers, setGenNumbers] = useState(true);
  const [genSymbols, setGenSymbols] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialEntry) {
        setTitle(initialEntry.title);
        setUrl(initialEntry.url);
        setUsername(initialEntry.username);
        setPassword(initialEntry.password);
        setCategory(initialEntry.category);
        setTotpSecret(initialEntry.totpSecret || '');
        setNotes(initialEntry.notes || '');
        setFavorite(Boolean(initialEntry.favorite));
      } else {
        setTitle('');
        setUrl('');
        setUsername('');
        setPassword('');
        setCategory('Personal');
        setTotpSecret('');
        setNotes('');
        setFavorite(false);
      }
      setShowPassword(false);
      setShowGenerator(false);
      setError(null);
    }
  }, [isOpen, initialEntry]);

  if (!isOpen) return null;

  const strength = evaluatePasswordStrength(password);
  const strengthBarColors = [
    'bg-red-500',
    'bg-amber-500',
    'bg-amber-400',
    'bg-emerald-500',
    'bg-emerald-600',
  ];

  const handleGenerate = () => {
    const generated = generateSecurePassword({
      length: genLength,
      upper: genUpper,
      lower: genLower,
      numbers: genNumbers,
      symbols: genSymbols,
    });
    setPassword(generated);
    setShowPassword(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Service or website name is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    const now = Date.now();
    const entry: PasswordEntry = {
      id: initialEntry?.id || createId('pwd'),
      title: title.trim(),
      url: url.trim(),
      username: username.trim(),
      password,
      category,
      totpSecret: totpSecret.trim() || undefined,
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
        aria-labelledby="pwd-modal-title"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h2 id="pwd-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {initialEntry ? 'Edit Password' : 'Add Password'}
          </h2>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Title / Service *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. SBI NetBanking, DigiLocker, Income Tax"
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
                onChange={(e) => setCategory(e.target.value as PasswordCategory)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Username / Email
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Website URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Password *
              </label>
              <button
                type="button"
                onClick={() => setShowGenerator((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>{showGenerator ? 'Hide Generator' : 'Generate Strong Password'}</span>
              </button>
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter or generate password"
                className="w-full px-3 py-2 pr-10 font-mono text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {password && (
              <div className="mt-2 space-y-1">
                <div className="grid grid-cols-5 gap-1 h-1">
                  {[0, 1, 2, 3, 4].map((idx) => (
                    <div
                      key={idx}
                      className={`rounded-full transition-colors ${
                        idx <= strength.score
                          ? strengthBarColors[strength.score]
                          : 'bg-slate-200 dark:bg-slate-800'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Strength: {strength.label}</span>
                  <span className="font-mono tabular-nums">{strength.entropyBits} bits</span>
                </div>
              </div>
            )}

            {showGenerator && (
              <div className="mt-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Length: <span className="font-mono tabular-nums">{genLength}</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Apply Generated</span>
                  </button>
                </div>
                <input
                  type="range"
                  min={8}
                  max={48}
                  value={genLength}
                  onChange={(e) => setGenLength(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={genUpper}
                      onChange={(e) => setGenUpper(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>A–Z</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={genLower}
                      onChange={(e) => setGenLower(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>a–z</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={genNumbers}
                      onChange={(e) => setGenNumbers(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>0–9</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={genSymbols}
                      onChange={(e) => setGenSymbols(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>!@#$</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              2FA Secret / Recovery Codes (Optional)
            </label>
            <input
              type="text"
              value={totpSecret}
              onChange={(e) => setTotpSecret(e.target.value)}
              placeholder="TOTP key or backup recovery code"
              className="w-full px-3 py-2 font-mono text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              placeholder="Security questions, account ID, or recovery instructions..."
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
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 whitespace-nowrap"
            >
              {initialEntry ? 'Save Changes' : 'Save Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
