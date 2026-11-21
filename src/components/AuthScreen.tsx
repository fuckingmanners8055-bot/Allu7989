import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderLock,
  KeyRound,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { AccountRecord } from '../types/vault';
import { evaluatePasswordStrength } from '../utils/crypto';

const PRESET_QUESTIONS = [
  'What city were you born in?',
  'What was the name of your first school?',
  'What was your first pet’s name?',
  'What is your favorite childhood book?',
  'Custom security question...',
];

interface AuthScreenProps {
  existingAccount: AccountRecord | null;
  onLogin: (loginId: string, password: string) => Promise<boolean>;
  onCreateAccount: (params: {
    loginId: string;
    password: string;
    securityQuestion?: string;
    securityAnswer?: string;
  }) => Promise<{ recoveryKey: string }>;
  onCompleteAccountSetup: () => void;
  onRecoverWithKey: (
    loginId: string,
    recoveryKey: string,
    newPassword: string
  ) => Promise<boolean>;
  onRecoverWithQuestion: (
    loginId: string,
    answer: string,
    newPassword: string
  ) => Promise<boolean>;
  onResetAllData: () => Promise<void>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  existingAccount,
  onLogin,
  onCreateAccount,
  onCompleteAccountSetup,
  onRecoverWithKey,
  onRecoverWithQuestion,
  onResetAllData,
}) => {
  const [view, setView] = useState<'login' | 'register' | 'forgot' | 'recovery_key_created'>(
    'login'
  );

  // Login state (always ask for both ID and password)
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);

  // Register state
  const [regLoginId, setRegLoginId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(PRESET_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Forgot password state
  const [forgotLoginId, setForgotLoginId] = useState(existingAccount?.loginId || '');
  const [recoveryMethod, setRecoveryMethod] = useState<'question' | 'key'>(
    existingAccount?.securityQuestion ? 'question' : 'key'
  );
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [securityAnswerInput, setSecurityAnswerInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showResetDanger, setShowResetDanger] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regStrength = evaluatePasswordStrength(regPassword);
  const newPassStrength = evaluatePasswordStrength(newPassword);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSetupNotice(null);
    const trimmedId = loginId.trim();
    if (!trimmedId || !password) {
      setError('Enter both your Login ID and Login Password.');
      return;
    }

    if (!existingAccount) {
      if (trimmedId.length < 3) {
        setError('Login ID must be at least 3 characters (e.g., email or username).');
        return;
      }
      if (password.length < 6) {
        setError('Login Password must be at least 6 characters.');
        return;
      }
      setRegLoginId(trimmedId);
      setRegPassword(password);
      setRegConfirm('');
      setSetupNotice(
        'No vault account exists on this browser yet. Confirm your password below to create your encrypted vault.'
      );
      setView('register');
      return;
    }

    setBusy(true);
    try {
      const ok = await onLogin(trimmedId, password);
      if (!ok) {
        setError('Invalid Login ID or Login Password.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (regLoginId.trim().length < 3) {
      setError('Login ID must be at least 3 characters (e.g., email or username).');
      return;
    }
    if (regPassword.length < 6) {
      setError('Login Password must be at least 6 characters.');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('Password confirmation does not match.');
      return;
    }

    const finalQuestion =
      selectedQuestion === 'Custom security question...'
        ? customQuestion.trim()
        : selectedQuestion;

    if (securityAnswer.trim() && !finalQuestion) {
      setError('Enter your custom security question or clear the answer.');
      return;
    }

    setBusy(true);
    try {
      const res = await onCreateAccount({
        loginId: regLoginId.trim(),
        password: regPassword,
        securityQuestion: securityAnswer.trim() ? finalQuestion : undefined,
        securityAnswer: securityAnswer.trim() || undefined,
      });
      setGeneratedRecoveryKey(res.recoveryKey);
      setView('recovery_key_created');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!forgotLoginId.trim()) {
      setError('Enter your Login ID.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New password confirmation does not match.');
      return;
    }

    setBusy(true);
    try {
      if (recoveryMethod === 'question') {
        if (!securityAnswerInput.trim()) {
          setError('Enter your security question answer.');
          return;
        }
        const ok = await onRecoverWithQuestion(
          forgotLoginId,
          securityAnswerInput,
          newPassword
        );
        if (!ok) {
          setError('Login ID or security answer is incorrect.');
        }
      } else {
        if (!recoveryKeyInput.trim()) {
          setError('Enter your 24-character Recovery Key.');
          return;
        }
        const ok = await onRecoverWithKey(
          forgotLoginId,
          recoveryKeyInput,
          newPassword
        );
        if (!ok) {
          setError('Login ID or Recovery Key is incorrect.');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const copyRecoveryKey = async () => {
    if (!generatedRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(generatedRecoveryKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // ignore
    }
  };

  const downloadRecoveryKey = () => {
    if (!generatedRecoveryKey) return;
    const text = `My thing Recovery Key\nLogin ID: ${regLoginId.trim()}\nRecovery Key: ${generatedRecoveryKey}\nCreated: ${new Date().toISOString()}\n\nKeep this file offline in a safe place. It can reset a forgotten login password without losing your stored passwords, PDFs, Excel sheets, or data records.`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-thing-recovery-key-${regLoginId.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (view === 'recovery_key_created' && generatedRecoveryKey) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Save Your Recovery Key
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Account: {regLoginId.trim()}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            Use this key if you ever forget your login password. Save or download a copy before entering your vault.
          </p>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
            <div className="font-mono text-sm sm:text-base font-semibold tracking-wider text-slate-900 dark:text-slate-100 select-all break-all">
              {generatedRecoveryKey}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={copyRecoveryKey}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {copiedKey ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Key</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={downloadRecoveryKey}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .TXT</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onCompleteAccountSetup}
            className="w-full px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
          >
            Continue to Vault
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shrink-0">
            <FolderLock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              My thing
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Passwords · PDFs · Excel Sheets · Data Records
            </p>
          </div>
        </div>

        {/* Mode Switcher when not in forgot flow */}
        {view !== 'forgot' && (
          <div className="grid grid-cols-2 gap-1 p-1 mb-6 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setView('login');
                setError(null);
                setSetupNotice(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setView('register');
                setError(null);
                setSetupNotice(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'register'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* LOGIN VIEW */}
        {view === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-id"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Login ID
              </label>
              <input
                id="login-id"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="Enter your Login ID"
                autoComplete="username"
                autoFocus
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Login Password
                </label>
                {existingAccount && (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotLoginId(loginId || '');
                      setRecoveryMethod(
                        existingAccount?.securityQuestion ? 'question' : 'key'
                      );
                      setError(null);
                      setShowResetDanger(false);
                      setView('forgot');
                    }}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
            </div>

            {error && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              <Unlock className="w-4 h-4" />
              <span>{busy ? 'Signing in...' : 'Sign In to Vault'}</span>
            </button>
          </form>
        )}

        {/* CREATE ACCOUNT VIEW */}
        {view === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            {setupNotice && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-800 dark:text-blue-300">
                {setupNotice}
              </div>
            )}

            {existingAccount && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Creating a new account replaces the existing local vault account ({existingAccount.loginId}).
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Login ID *
              </label>
              <input
                type="text"
                value={regLoginId}
                onChange={(e) => setRegLoginId(e.target.value)}
                placeholder="Choose a username or email"
                autoFocus
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Login Password *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Confirm Password *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {regPassword && (
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Password strength: {regStrength.label}</span>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Forgot-Password Security Question (Recommended)
              </div>

              <select
                value={selectedQuestion}
                onChange={(e) => setSelectedQuestion(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {PRESET_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>

              {selectedQuestion === 'Custom security question...' && (
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Enter your custom security question"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              )}

              <input
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="Your answer (used to reset password if forgotten)"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {error && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Creating Encrypted Account...' : 'Create Vault Account'}
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD / RESET VIEW */}
        {view === 'forgot' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => {
                setView('login');
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>

            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Reset Forgotten Password
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Verify with your security question or recovery key to set a new login password without losing your stored files.
              </p>
            </div>

            {existingAccount?.securityQuestion && (
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod('question');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    recoveryMethod === 'question'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Security Question
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod('key');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    recoveryMethod === 'key'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Recovery Key
                </button>
              </div>
            )}

            <form onSubmit={handleForgotSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Login ID
                </label>
                <input
                  type="text"
                  value={forgotLoginId}
                  onChange={(e) => setForgotLoginId(e.target.value)}
                  placeholder="Your Login ID"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {recoveryMethod === 'question' && existingAccount?.securityQuestion ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {existingAccount.securityQuestion}
                  </label>
                  <input
                    type="text"
                    value={securityAnswerInput}
                    onChange={(e) => setSecurityAnswerInput(e.target.value)}
                    placeholder="Enter your answer"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    24-Character Recovery Key
                  </label>
                  <input
                    type="text"
                    value={recoveryKeyInput}
                    onChange={(e) => setRecoveryKeyInput(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    className="w-full px-3 py-2 font-mono text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {newPassword && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Strength: {newPassStrength.label}
                </p>
              )}

              {error && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Verifying & Resetting...' : 'Reset Password & Unlock'}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              {!showResetDanger ? (
                <button
                  type="button"
                  onClick={() => setShowResetDanger(true)}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  Lost both recovery key and security answer? Reset vault
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-600 dark:text-red-400">
                    This permanently deletes your encrypted account and all stored items so you can start over.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await onResetAllData();
                        setLoginId('');
                        setPassword('');
                        setSetupNotice(null);
                        setView('login');
                        setShowResetDanger(false);
                      }}
                      className="px-3 py-1.5 rounded-md bg-red-600 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Confirm Erase & Start Over
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResetDanger(false)}
                      className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
