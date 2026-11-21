import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Link2,
  Menu,
  Moon,
  Plus,
  Search,
  Share2,
  Star,
  Sun,
  TableProperties,
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { DataRecordModal } from './components/DataRecordModal';
import { ExcelModal } from './components/ExcelModal';
import { ExcelViewerModal } from './components/ExcelViewerModal';
import { InspectorPanel } from './components/InspectorPanel';
import { LinkModal } from './components/LinkModal';
import { PasswordModal } from './components/PasswordModal';
import { PdfUploadModal } from './components/PdfUploadModal';
import { PdfViewerModal } from './components/PdfViewerModal';
import { SecurityBackupView } from './components/SecurityBackupView';
import { SharedItemView } from './components/SharedItemView';
import { ShareModal } from './components/ShareModal';
import { Sidebar } from './components/Sidebar';
import {
  AccountRecord,
  ActiveItemRef,
  DataRecordEntry,
  ExcelEntry,
  LinkEntry,
  PasswordEntry,
  PdfEntry,
  ShareableItem,
  StoredVaultEnvelope,
  VaultData,
  VaultSection,
} from './types/vault';
import {
  authenticateWithPassword,
  changeAccountCredentials,
  createAccountAndWrapVault,
  decryptVaultWithDek,
  encryptVaultWithDek,
  recoverWithRecoveryKey,
  recoverWithSecurityAnswer,
  regenerateAccountRecoveryKey,
  updateAccountSecurityQuestion,
} from './utils/auth';
import { formatBytes, formatDate } from './utils/crypto';
import { revokeShortUrl, sanitizeExternalUrl } from './utils/share';
import { computeEntryGrandTotal, formatAmount } from './utils/spreadsheet';
import {
  clearVaultStorage,
  EMPTY_VAULT,
  estimateVaultBytes,
  loadAccountRecord,
  loadVaultEnvelope,
  saveAccountRecord,
  saveVaultEnvelope,
} from './utils/storage';

type UnifiedRow =
  | { kind: 'password'; updatedAt: number; favorite?: boolean; item: PasswordEntry }
  | { kind: 'pdf'; updatedAt: number; favorite?: boolean; item: PdfEntry }
  | { kind: 'excel'; updatedAt: number; favorite?: boolean; item: ExcelEntry }
  | { kind: 'record'; updatedAt: number; favorite?: boolean; item: DataRecordEntry }
  | { kind: 'link'; updatedAt: number; favorite?: boolean; item: LinkEntry };

export default function App() {
  const [shareId, setShareId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('share');
    } catch {
      return null;
    }
  });

  const [booting, setBooting] = useState(true);
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [storedEnvelope, setStoredEnvelope] = useState<StoredVaultEnvelope | null>(null);
  const [dekBase64, setDekBase64] = useState<string | null>(null);
  const [awaitingRecoveryAck, setAwaitingRecoveryAck] = useState(false);

  const [vault, setVault] = useState<VaultData>(EMPTY_VAULT);
  const [activeSection, setActiveSection] = useState<VaultSection>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'password' | 'pdf' | 'excel' | 'record' | 'link'
  >('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [activeItem, setActiveItem] = useState<ActiveItemRef | null>(null);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  // Modals
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [editingPassword, setEditingPassword] = useState<PasswordEntry | null>(null);

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [editingPdf, setEditingPdf] = useState<PdfEntry | null>(null);
  const [viewingPdf, setViewingPdf] = useState<PdfEntry | null>(null);

  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [editingExcel, setEditingExcel] = useState<ExcelEntry | null>(null);
  const [viewingExcel, setViewingExcel] = useState<ExcelEntry | null>(null);

  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecordEntry | null>(null);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkEntry | null>(null);

  const [sharingItem, setSharingItem] = useState<ShareableItem | null>(null);

  // Theme
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('strongbox_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('strongbox_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  // Initial IndexedDB load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [acc, env] = await Promise.all([
          loadAccountRecord(),
          loadVaultEnvelope(),
        ]);
        if (cancelled) return;
        setAccount(acc);
        setStoredEnvelope(env);
      } catch (err) {
        console.error('Failed to load vault state from IndexedDB:', err);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setNewMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!newMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [newMenuOpen]);

  // Persist encrypted vault using active DEK
  const persistVault = useCallback(
    async (nextVault: VaultData, dekOverride?: string) => {
      const activeDek = dekOverride || dekBase64;
      if (!activeDek) return;
      const encrypted = await encryptVaultWithDek(nextVault, activeDek);
      const envelope: StoredVaultEnvelope = {
        encrypted: true,
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        updatedAt: Date.now(),
      };
      await saveVaultEnvelope(envelope);
      setStoredEnvelope(envelope);
    },
    [dekBase64]
  );

  const handleSignOut = useCallback(() => {
    setDekBase64(null);
    setVault(EMPTY_VAULT);
    setActiveItem(null);
    setViewingPdf(null);
    setViewingExcel(null);
  }, []);

  // Auto-lock timer when signed in
  useEffect(() => {
    if (!dekBase64 || awaitingRecoveryAck || vault.autoLockMinutes <= 0) {
      return;
    }

    let timerId: number;
    const resetTimer = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        handleSignOut();
      }, vault.autoLockMinutes * 60 * 1000);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      window.clearTimeout(timerId);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [dekBase64, awaitingRecoveryAck, vault.autoLockMinutes, handleSignOut]);

  // Auth handlers
  const handleCreateAccount = async (params: {
    loginId: string;
    password: string;
    securityQuestion?: string;
    securityAnswer?: string;
  }): Promise<{ recoveryKey: string }> => {
    const { account: newAcc, recoveryKey, dekBase64: newDek } =
      await createAccountAndWrapVault(params);

    // Migrate any pre-existing unencrypted vault if present
    let initialVault: VaultData = EMPTY_VAULT;
    if (storedEnvelope && !storedEnvelope.encrypted && storedEnvelope.plain) {
      initialVault = {
        passwords: storedEnvelope.plain.passwords || [],
        pdfs: storedEnvelope.plain.pdfs || [],
        excels: storedEnvelope.plain.excels || [],
        records: storedEnvelope.plain.records || [],
        links: storedEnvelope.plain.links || [],
        autoLockMinutes: storedEnvelope.plain.autoLockMinutes ?? 15,
      };
    }

    await saveAccountRecord(newAcc);
    await persistVault(initialVault, newDek);

    setAccount(newAcc);
    setVault(initialVault);
    setDekBase64(newDek);
    setAwaitingRecoveryAck(true);

    return { recoveryKey };
  };

  const handleLogin = async (loginId: string, password: string): Promise<boolean> => {
    if (!account) return false;
    const dek = await authenticateWithPassword(account, loginId, password);
    if (!dek) return false;

    let loadedVault: VaultData = EMPTY_VAULT;
    if (
      storedEnvelope?.encrypted &&
      storedEnvelope.iv &&
      storedEnvelope.ciphertext &&
      !storedEnvelope.salt
    ) {
      loadedVault = await decryptVaultWithDek(
        { iv: storedEnvelope.iv, ciphertext: storedEnvelope.ciphertext },
        dek
      );
    } else if (storedEnvelope && !storedEnvelope.encrypted && storedEnvelope.plain) {
      loadedVault = {
        passwords: storedEnvelope.plain.passwords || [],
        pdfs: storedEnvelope.plain.pdfs || [],
        excels: storedEnvelope.plain.excels || [],
        records: storedEnvelope.plain.records || [],
        links: storedEnvelope.plain.links || [],
        autoLockMinutes: storedEnvelope.plain.autoLockMinutes ?? 15,
      };
      await persistVault(loadedVault, dek);
    }

    setVault(loadedVault);
    setDekBase64(dek);
    setAwaitingRecoveryAck(false);
    return true;
  };

  const handleRecoverWithKey = async (
    loginId: string,
    recoveryKey: string,
    newPassword: string
  ): Promise<boolean> => {
    if (!account) return false;
    const res = await recoverWithRecoveryKey(account, loginId, recoveryKey, newPassword);
    if (!res) return false;

    await saveAccountRecord(res.updatedAccount);
    setAccount(res.updatedAccount);

    if (storedEnvelope?.encrypted && storedEnvelope.iv && storedEnvelope.ciphertext) {
      const loaded = await decryptVaultWithDek(
        { iv: storedEnvelope.iv, ciphertext: storedEnvelope.ciphertext },
        res.dekBase64
      );
      setVault(loaded);
    } else {
      setVault(EMPTY_VAULT);
    }
    setDekBase64(res.dekBase64);
    setAwaitingRecoveryAck(false);
    return true;
  };

  const handleRecoverWithQuestion = async (
    loginId: string,
    answer: string,
    newPassword: string
  ): Promise<boolean> => {
    if (!account) return false;
    const res = await recoverWithSecurityAnswer(account, loginId, answer, newPassword);
    if (!res) return false;

    await saveAccountRecord(res.updatedAccount);
    setAccount(res.updatedAccount);

    if (storedEnvelope?.encrypted && storedEnvelope.iv && storedEnvelope.ciphertext) {
      const loaded = await decryptVaultWithDek(
        { iv: storedEnvelope.iv, ciphertext: storedEnvelope.ciphertext },
        res.dekBase64
      );
      setVault(loaded);
    } else {
      setVault(EMPTY_VAULT);
    }
    setDekBase64(res.dekBase64);
    setAwaitingRecoveryAck(false);
    return true;
  };

  const handleResetAllData = async () => {
    await clearVaultStorage();
    setAccount(null);
    setStoredEnvelope(null);
    setDekBase64(null);
    setAwaitingRecoveryAck(false);
    setVault(EMPTY_VAULT);
    setActiveItem(null);
    setViewingPdf(null);
    setViewingExcel(null);
  };

  // Account security settings
  const handleChangeCredentials = async (
    currentPass: string,
    updates: { newLoginId?: string; newPassword?: string }
  ): Promise<boolean> => {
    if (!account) return false;
    const updated = await changeAccountCredentials(account, currentPass, updates);
    if (!updated) return false;
    await saveAccountRecord(updated);
    setAccount(updated);
    return true;
  };

  const handleUpdateSecurityQuestion = async (question: string, answer: string) => {
    if (!account || !dekBase64) return;
    const updated = await updateAccountSecurityQuestion(
      account,
      dekBase64,
      question,
      answer
    );
    await saveAccountRecord(updated);
    setAccount(updated);
  };

  const handleRegenerateRecoveryKey = async (): Promise<string> => {
    if (!account || !dekBase64) return '';
    const res = await regenerateAccountRecoveryKey(account, dekBase64);
    await saveAccountRecord(res.updatedAccount);
    setAccount(res.updatedAccount);
    return res.recoveryKey;
  };

  const handleUpdateAutoLock = (minutes: number) => {
    const nextVault = { ...vault, autoLockMinutes: minutes };
    setVault(nextVault);
    void persistVault(nextVault);
  };

  const handleImportVaultData = (data: VaultData, mode: 'replace' | 'merge') => {
    let nextVault: VaultData;
    if (mode === 'replace') {
      nextVault = {
        passwords: data.passwords || [],
        pdfs: data.pdfs || [],
        excels: data.excels || [],
        records: data.records || [],
        links: data.links || [],
        autoLockMinutes: data.autoLockMinutes ?? vault.autoLockMinutes,
      };
    } else {
      const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]) => {
        const map = new Map<string, T>();
        existing.forEach((x) => map.set(x.id, x));
        incoming.forEach((x) => map.set(x.id, x));
        return Array.from(map.values());
      };
      nextVault = {
        passwords: mergeById(vault.passwords, data.passwords || []),
        pdfs: mergeById(vault.pdfs, data.pdfs || []),
        excels: mergeById(vault.excels, data.excels || []),
        records: mergeById(vault.records, data.records || []),
        links: mergeById(vault.links || [], data.links || []),
        autoLockMinutes: vault.autoLockMinutes,
      };
    }
    setVault(nextVault);
    setActiveItem(null);
    void persistVault(nextVault);
  };

  // CRUD handlers
  const savePassword = (entry: PasswordEntry) => {
    const exists = vault.passwords.some((p) => p.id === entry.id);
    const nextPasswords = exists
      ? vault.passwords.map((p) => (p.id === entry.id ? entry : p))
      : [entry, ...vault.passwords];
    const nextVault = { ...vault, passwords: nextPasswords };
    setVault(nextVault);
    setActiveItem({ type: 'password', id: entry.id });
    void persistVault(nextVault);
  };

  const deletePassword = (id: string) => {
    const nextVault = {
      ...vault,
      passwords: vault.passwords.filter((p) => p.id !== id),
    };
    setVault(nextVault);
    if (activeItem?.type === 'password' && activeItem.id === id) {
      setActiveItem(null);
    }
    void persistVault(nextVault);
  };

  const toggleFavoritePassword = (id: string) => {
    const nextVault = {
      ...vault,
      passwords: vault.passwords.map((p) =>
        p.id === id ? { ...p, favorite: !p.favorite } : p
      ),
    };
    setVault(nextVault);
    void persistVault(nextVault);
  };

  const savePdf = (entry: PdfEntry) => {
    const exists = vault.pdfs.some((p) => p.id === entry.id);
    const nextPdfs = exists
      ? vault.pdfs.map((p) => (p.id === entry.id ? entry : p))
      : [entry, ...vault.pdfs];
    const nextVault = { ...vault, pdfs: nextPdfs };
    setVault(nextVault);
    setActiveItem({ type: 'pdf', id: entry.id });
    void persistVault(nextVault);
  };

  const deletePdf = (id: string) => {
    const nextVault = {
      ...vault,
      pdfs: vault.pdfs.filter((p) => p.id !== id),
    };
    setVault(nextVault);
    if (activeItem?.type === 'pdf' && activeItem.id === id) {
      setActiveItem(null);
    }
    if (viewingPdf?.id === id) {
      setViewingPdf(null);
    }
    void persistVault(nextVault);
  };

  const toggleFavoritePdf = (id: string) => {
    const nextVault = {
      ...vault,
      pdfs: vault.pdfs.map((p) =>
        p.id === id ? { ...p, favorite: !p.favorite } : p
      ),
    };
    setVault(nextVault);
    void persistVault(nextVault);
  };

  const saveExcel = (entry: ExcelEntry, openImmediately = false) => {
    const exists = vault.excels.some((x) => x.id === entry.id);
    const nextExcels = exists
      ? vault.excels.map((x) => (x.id === entry.id ? entry : x))
      : [entry, ...vault.excels];
    const nextVault = { ...vault, excels: nextExcels };
    setVault(nextVault);
    setActiveItem({ type: 'excel', id: entry.id });
    if (openImmediately) {
      setViewingExcel(entry);
    } else if (viewingExcel?.id === entry.id) {
      setViewingExcel(entry);
    }
    void persistVault(nextVault);
  };

  const deleteExcel = (id: string) => {
    const nextVault = {
      ...vault,
      excels: vault.excels.filter((x) => x.id !== id),
    };
    setVault(nextVault);
    if (activeItem?.type === 'excel' && activeItem.id === id) {
      setActiveItem(null);
    }
    if (viewingExcel?.id === id) {
      setViewingExcel(null);
    }
    void persistVault(nextVault);
  };

  const toggleFavoriteExcel = (id: string) => {
    const nextVault = {
      ...vault,
      excels: vault.excels.map((x) =>
        x.id === id ? { ...x, favorite: !x.favorite } : x
      ),
    };
    setVault(nextVault);
    void persistVault(nextVault);
  };

  const saveRecord = (entry: DataRecordEntry) => {
    const exists = vault.records.some((r) => r.id === entry.id);
    const nextRecords = exists
      ? vault.records.map((r) => (r.id === entry.id ? entry : r))
      : [entry, ...vault.records];
    const nextVault = { ...vault, records: nextRecords };
    setVault(nextVault);
    setActiveItem({ type: 'record', id: entry.id });
    void persistVault(nextVault);
  };

  const deleteRecord = (id: string) => {
    const nextVault = {
      ...vault,
      records: vault.records.filter((r) => r.id !== id),
    };
    setVault(nextVault);
    if (activeItem?.type === 'record' && activeItem.id === id) {
      setActiveItem(null);
    }
    void persistVault(nextVault);
  };

  const toggleFavoriteRecord = (id: string) => {
    const nextVault = {
      ...vault,
      records: vault.records.map((r) =>
        r.id === id ? { ...r, favorite: !r.favorite } : r
      ),
    };
    setVault(nextVault);
    void persistVault(nextVault);
  };

  const saveLink = (entry: LinkEntry) => {
    const existingLinks = vault.links || [];
    const exists = existingLinks.some((l) => l.id === entry.id);
    const nextLinks = exists
      ? existingLinks.map((l) => (l.id === entry.id ? entry : l))
      : [entry, ...existingLinks];
    const nextVault = { ...vault, links: nextLinks };
    setVault(nextVault);
    setActiveItem({ type: 'link', id: entry.id });
    void persistVault(nextVault);
  };

  const deleteLink = (id: string) => {
    const target = (vault.links || []).find((l) => l.id === id);
    if (target?.shortSlug && target?.shortRevokeToken) {
      void revokeShortUrl(target.shortSlug, target.shortRevokeToken).catch(() => undefined);
    }
    const nextVault = {
      ...vault,
      links: (vault.links || []).filter((l) => l.id !== id),
    };
    setVault(nextVault);
    if (activeItem?.type === 'link' && activeItem.id === id) {
      setActiveItem(null);
    }
    void persistVault(nextVault);
  };

  const toggleFavoriteLink = (id: string) => {
    const nextVault = {
      ...vault,
      links: (vault.links || []).map((l) =>
        l.id === id ? { ...l, favorite: !l.favorite } : l
      ),
    };
    setVault(nextVault);
    void persistVault(nextVault);
  };

  const handleRevokeShortUrl = async (entry: LinkEntry) => {
    if (entry.shortSlug && entry.shortRevokeToken) {
      try {
        await revokeShortUrl(entry.shortSlug, entry.shortRevokeToken);
      } catch {
        // ignore if already expired
      }
    }
    const updated: LinkEntry = {
      ...entry,
      shortSlug: undefined,
      shortUrl: undefined,
      shortRevokeToken: undefined,
      shortExpiresAt: undefined,
      updatedAt: Date.now(),
    };
    saveLink(updated);
  };

  const handleQuickCopy = async (e: React.MouseEvent, rowId: string, value: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopiedRowId(rowId);
      setTimeout(() => {
        setCopiedRowId((curr) => (curr === rowId ? null : curr));
      }, 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const storageBytes = useMemo(() => estimateVaultBytes(vault), [vault]);

  const counts = useMemo(
    () => {
      const linksList = vault.links || [];
      return {
        all:
          vault.passwords.length +
          vault.pdfs.length +
          vault.excels.length +
          vault.records.length +
          linksList.length,
        passwords: vault.passwords.length,
        pdfs: vault.pdfs.length,
        excels: vault.excels.length,
        records: vault.records.length,
        links: linksList.length,
      };
    },
    [vault]
  );

  const totalExcelAmount = useMemo(() => {
    return vault.excels.reduce(
      (sum, entry) => sum + computeEntryGrandTotal(entry.sheets),
      0
    );
  }, [vault.excels]);

  const primaryExcelCurrency = vault.excels[0]?.currency || '₹';

  const availableCategories = useMemo(() => {
    if (activeSection === 'passwords') {
      return ['All', ...Array.from(new Set(vault.passwords.map((p) => p.category)))];
    }
    if (activeSection === 'pdfs') {
      return ['All', ...Array.from(new Set(vault.pdfs.map((p) => p.category)))];
    }
    if (activeSection === 'excels') {
      return ['All', ...Array.from(new Set(vault.excels.map((x) => x.category)))];
    }
    if (activeSection === 'records') {
      return ['All', ...Array.from(new Set(vault.records.map((r) => r.template)))];
    }
    if (activeSection === 'links') {
      return ['All', ...Array.from(new Set((vault.links || []).map((l) => l.category)))];
    }
    return ['All'];
  }, [activeSection, vault]);

  const filteredRows = useMemo<UnifiedRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows: UnifiedRow[] = [];

    const includePasswords =
      activeSection === 'passwords' ||
      (activeSection === 'all' && (typeFilter === 'all' || typeFilter === 'password'));
    const includePdfs =
      activeSection === 'pdfs' ||
      (activeSection === 'all' && (typeFilter === 'all' || typeFilter === 'pdf'));
    const includeExcels =
      activeSection === 'excels' ||
      (activeSection === 'all' && (typeFilter === 'all' || typeFilter === 'excel'));
    const includeRecords =
      activeSection === 'records' ||
      (activeSection === 'all' && (typeFilter === 'all' || typeFilter === 'record'));
    const includeLinks =
      activeSection === 'links' ||
      (activeSection === 'all' && (typeFilter === 'all' || typeFilter === 'link'));

    if (includePasswords) {
      for (const p of vault.passwords) {
        if (onlyFavorites && !p.favorite) continue;
        if (
          activeSection === 'passwords' &&
          categoryFilter !== 'All' &&
          p.category !== categoryFilter
        ) {
          continue;
        }
        if (q) {
          const hay = `${p.title} ${p.username} ${p.url} ${p.category} ${p.notes || ''}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        rows.push({ kind: 'password', updatedAt: p.updatedAt, favorite: p.favorite, item: p });
      }
    }

    if (includePdfs) {
      for (const d of vault.pdfs) {
        if (onlyFavorites && !d.favorite) continue;
        if (
          activeSection === 'pdfs' &&
          categoryFilter !== 'All' &&
          d.category !== categoryFilter
        ) {
          continue;
        }
        if (q) {
          const hay = `${d.title} ${d.fileName} ${d.category} ${d.notes || ''}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        rows.push({ kind: 'pdf', updatedAt: d.updatedAt, favorite: d.favorite, item: d });
      }
    }

    if (includeExcels) {
      for (const x of vault.excels) {
        if (onlyFavorites && !x.favorite) continue;
        if (
          activeSection === 'excels' &&
          categoryFilter !== 'All' &&
          x.category !== categoryFilter
        ) {
          continue;
        }
        if (q) {
          const sheetText = x.sheets.map((s) => `${s.name} ${s.headers.join(' ')}`).join(' ');
          const hay = `${x.title} ${x.fileName} ${x.category} ${sheetText} ${x.notes || ''}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        rows.push({ kind: 'excel', updatedAt: x.updatedAt, favorite: x.favorite, item: x });
      }
    }

    if (includeRecords) {
      for (const r of vault.records) {
        if (onlyFavorites && !r.favorite) continue;
        if (
          activeSection === 'records' &&
          categoryFilter !== 'All' &&
          r.template !== categoryFilter
        ) {
          continue;
        }
        if (q) {
          const fieldsText = r.fields.map((f) => `${f.label} ${f.sensitive ? '' : f.value}`).join(' ');
          const hay = `${r.title} ${r.template} ${fieldsText} ${r.notes || ''}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        rows.push({ kind: 'record', updatedAt: r.updatedAt, favorite: r.favorite, item: r });
      }
    }

    if (includeLinks) {
      for (const l of vault.links || []) {
        if (onlyFavorites && !l.favorite) continue;
        if (
          activeSection === 'links' &&
          categoryFilter !== 'All' &&
          l.category !== categoryFilter
        ) {
          continue;
        }
        if (q) {
          const tagsText = (l.tags || []).join(' ');
          const hay = `${l.title} ${l.url} ${l.shortSlug || ''} ${l.shortUrl || ''} ${l.category} ${l.description || ''} ${tagsText} ${l.notes || ''}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        rows.push({ kind: 'link', updatedAt: l.updatedAt, favorite: l.favorite, item: l });
      }
    }

    rows.sort((a, b) => {
      if (Boolean(a.favorite) !== Boolean(b.favorite)) {
        return a.favorite ? -1 : 1;
      }
      return b.updatedAt - a.updatedAt;
    });

    return rows;
  }, [
    vault,
    activeSection,
    typeFilter,
    categoryFilter,
    onlyFavorites,
    searchQuery,
  ]);

  const handleSectionChange = (section: VaultSection) => {
    setActiveSection(section);
    setCategoryFilter('All');
    setTypeFilter('all');
    if (section === 'security') {
      setActiveItem(null);
    }
  };

  if (shareId) {
    return (
      <SharedItemView
        shareId={shareId}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onExitShare={() => {
          window.history.pushState({}, '', '/');
          setShareId(null);
        }}
      />
    );
  }

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading My thing...</div>
      </div>
    );
  }

  // Require login / account setup / recovery key acknowledgement before entering vault
  if (!dekBase64 || awaitingRecoveryAck) {
    return (
      <AuthScreen
        existingAccount={account}
        onLogin={handleLogin}
        onCreateAccount={handleCreateAccount}
        onCompleteAccountSetup={() => setAwaitingRecoveryAck(false)}
        onRecoverWithKey={handleRecoverWithKey}
        onRecoverWithQuestion={handleRecoverWithQuestion}
        onResetAllData={handleResetAllData}
      />
    );
  }

  const sectionLabels: Record<VaultSection, string> = {
    all: 'All Items',
    passwords: 'Passwords',
    pdfs: 'PDF Documents',
    excels: 'Excel & Ledgers',
    records: 'Data Records',
    links: 'Links & URLs',
    security: 'Settings & Backup',
  };

  const openCreateForSection = () => {
    if (activeSection === 'passwords') {
      setEditingPassword(null);
      setPasswordModalOpen(true);
    } else if (activeSection === 'pdfs') {
      setEditingPdf(null);
      setPdfModalOpen(true);
    } else if (activeSection === 'excels') {
      setEditingExcel(null);
      setExcelModalOpen(true);
    } else if (activeSection === 'records') {
      setEditingRecord(null);
      setRecordModalOpen(true);
    } else if (activeSection === 'links') {
      setEditingLink(null);
      setLinkModalOpen(true);
    } else {
      setNewMenuOpen((v) => !v);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={handleSectionChange}
        counts={counts}
        storageBytes={storageBytes}
        loginId={account?.loginId || null}
        onSignOut={handleSignOut}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                Vault
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {sectionLabels[activeSection]}
              </h1>
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {activeSection !== 'security' && (
              <div className="relative" ref={newMenuRef}>
                <button
                  type="button"
                  onClick={openCreateForSection}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {activeSection === 'passwords'
                      ? 'Add Password'
                      : activeSection === 'pdfs'
                      ? 'Upload PDF'
                      : activeSection === 'excels'
                      ? 'Add Excel'
                      : activeSection === 'records'
                      ? 'Add Record'
                      : activeSection === 'links'
                      ? 'Create URL'
                      : 'New Entry'}
                  </span>
                  {activeSection === 'all' && <ChevronDown className="w-3.5 h-3.5 opacity-80" />}
                </button>

                {activeSection === 'all' && newMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-1.5 z-40">
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        setEditingPassword(null);
                        setPasswordModalOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Add Password</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        setEditingPdf(null);
                        setPdfModalOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Upload PDF Document</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        setEditingExcel(null);
                        setExcelModalOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Add Excel / Ledger</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        setEditingRecord(null);
                        setRecordModalOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <TableProperties className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Add Data Record</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        setEditingLink(null);
                        setLinkModalOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <Link2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Create / Store URL</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Main workspace area + Inspector */}
        <div className="flex-1 flex min-w-0">
          <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
            {activeSection === 'security' ? (
              <SecurityBackupView
                account={account}
                vault={vault}
                storageBytes={storageBytes}
                onChangeCredentials={handleChangeCredentials}
                onUpdateSecurityQuestion={handleUpdateSecurityQuestion}
                onRegenerateRecoveryKey={handleRegenerateRecoveryKey}
                onUpdateAutoLock={handleUpdateAutoLock}
                onImportVaultData={handleImportVaultData}
                onResetVault={handleResetAllData}
              />
            ) : (
              <>
                {/* Summary strip on All Items */}
                {activeSection === 'all' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    <button
                      type="button"
                      onClick={() => handleSectionChange('passwords')}
                      className="text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Passwords
                        </span>
                        <KeyRound className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {vault.passwords.length}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Logins, URLs & 2FA keys
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSectionChange('pdfs')}
                      className="text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          PDF Documents
                        </span>
                        <FileText className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {vault.pdfs.length}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {formatBytes(vault.pdfs.reduce((acc, d) => acc + d.fileSize, 0))}{' '}
                        stored
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSectionChange('excels')}
                      className="text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Excel & Ledgers
                        </span>
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {vault.excels.length}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                        Total {formatAmount(totalExcelAmount, primaryExcelCurrency)}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSectionChange('records')}
                      className="text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Data Records
                        </span>
                        <TableProperties className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {vault.records.length}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        IDs, bank info, keys & notes
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSectionChange('links')}
                      className="text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Links & URLs
                        </span>
                        <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {(vault.links || []).length}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Bookmarks, portals & URLs
                      </div>
                    </button>
                  </div>
                )}

                {/* Automatic Excel Aggregate Strip when viewing Excel & Ledgers */}
                {activeSection === 'excels' && vault.excels.length > 0 && (
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Combined Calculated Amount ({vault.excels.length}{' '}
                        {vault.excels.length === 1 ? 'spreadsheet' : 'spreadsheets'})
                      </div>
                      <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                        {formatAmount(totalExcelAmount, primaryExcelCurrency)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Click any row or Open to edit cells, add rows, or adjust formula calculations.
                    </div>
                  </div>
                )}

                {/* Search & Filter Toolbar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search titles, URLs, spreadsheets, PDFs, notes... (/)"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeSection === 'all' && (
                      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg overflow-x-auto max-w-full">
                        {(
                          [
                            { id: 'all', label: 'All' },
                            { id: 'password', label: 'Passwords' },
                            { id: 'pdf', label: 'PDFs' },
                            { id: 'excel', label: 'Excels' },
                            { id: 'record', label: 'Records' },
                            { id: 'link', label: 'Links' },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setTypeFilter(tab.id)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                              typeFilter === tab.id
                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {activeSection !== 'all' && availableCategories.length > 1 && (
                      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg overflow-x-auto max-w-full">
                        {availableCategories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setCategoryFilter(cat)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                              categoryFilter === cat
                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setOnlyFavorites((v) => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        onlyFavorites
                          ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          onlyFavorites ? 'fill-current text-amber-500' : ''
                        }`}
                      />
                      <span>Favorites</span>
                    </button>
                  </div>
                </div>

                {/* Data Grid / Empty State */}
                {filteredRows.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center space-y-4">
                    <div className="w-11 h-11 mx-auto rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                      {activeSection === 'passwords' ? (
                        <KeyRound className="w-5 h-5" />
                      ) : activeSection === 'pdfs' ? (
                        <FileText className="w-5 h-5" />
                      ) : activeSection === 'excels' ? (
                        <FileSpreadsheet className="w-5 h-5" />
                      ) : activeSection === 'links' ? (
                        <Link2 className="w-5 h-5" />
                      ) : (
                        <TableProperties className="w-5 h-5" />
                      )}
                    </div>
                    <div className="max-w-md mx-auto space-y-1.5">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {searchQuery || onlyFavorites || categoryFilter !== 'All' || typeFilter !== 'all'
                          ? 'No matching items found'
                          : activeSection === 'passwords'
                          ? 'No passwords stored yet'
                          : activeSection === 'pdfs'
                          ? 'No PDF documents stored yet'
                          : activeSection === 'excels'
                          ? 'No Excel spreadsheets stored yet'
                          : activeSection === 'records'
                          ? 'No data records stored yet'
                          : activeSection === 'links'
                          ? 'No links or URLs stored yet'
                          : 'Your vault is empty'}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {searchQuery || onlyFavorites || categoryFilter !== 'All' || typeFilter !== 'all'
                          ? 'Adjust your search query or clear active filters to view stored entries.'
                          : 'Store website passwords, upload PDFs, add Excel sheets with automatic amount calculation, save personal data records, or bookmark links & URLs.'}
                      </p>
                    </div>

                    {!(searchQuery || onlyFavorites || categoryFilter !== 'All' || typeFilter !== 'all') && (
                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                        {(activeSection === 'all' || activeSection === 'passwords') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPassword(null);
                              setPasswordModalOpen(true);
                            }}
                            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
                          >
                            Add Password
                          </button>
                        )}
                        {(activeSection === 'all' || activeSection === 'pdfs') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPdf(null);
                              setPdfModalOpen(true);
                            }}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                              activeSection === 'pdfs'
                                ? 'bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500'
                                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            Upload PDF
                          </button>
                        )}
                        {(activeSection === 'all' || activeSection === 'excels') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingExcel(null);
                              setExcelModalOpen(true);
                            }}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                              activeSection === 'excels'
                                ? 'bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500'
                                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            Add Excel / Ledger
                          </button>
                        )}
                        {(activeSection === 'all' || activeSection === 'records') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRecord(null);
                              setRecordModalOpen(true);
                            }}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                              activeSection === 'records'
                                ? 'bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500'
                                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            Add Data Record
                          </button>
                        )}
                        {(activeSection === 'all' || activeSection === 'links') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLink(null);
                              setLinkModalOpen(true);
                            }}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                              activeSection === 'links'
                                ? 'bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500'
                                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            Create / Store URL
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <div className="col-span-5">Item</div>
                      <div className="col-span-3">Details / Total</div>
                      <div className="col-span-2 text-right">Updated</div>
                      <div className="col-span-2 text-right">Action</div>
                    </div>

                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredRows.map((row) => {
                        const isSelected =
                          activeItem?.type === row.kind && activeItem.id === row.item.id;

                        if (row.kind === 'password') {
                          const item = row.item;
                          return (
                            <div
                              key={item.id}
                              onClick={() => setActiveItem({ type: 'password', id: item.id })}
                              className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-3 items-center cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50/60 dark:bg-blue-950/30'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                                <KeyRound className="w-4 h-4 text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                      {item.title}
                                    </span>
                                    {item.favorite && (
                                      <Star className="w-3 h-3 text-amber-500 fill-current shrink-0" />
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {item.username || item.url || 'No username'}
                                  </div>
                                </div>
                              </div>

                              <div className="sm:col-span-3 text-xs text-slate-500 dark:text-slate-400 truncate">
                                {item.category}
                              </div>

                              <div className="sm:col-span-2 text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500 sm:text-right">
                                {formatDate(item.updatedAt)}
                              </div>

                              <div className="sm:col-span-2 flex items-center sm:justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => handleQuickCopy(e, item.id, item.password)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
                                >
                                  {copiedRowId === item.id ? (
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
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSharingItem({ kind: 'password', item });
                                  }}
                                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800"
                                  aria-label="Share encrypted link"
                                  title="Share link"
                                >
                                  <Share2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (row.kind === 'pdf') {
                          const item = row.item;
                          return (
                            <div
                              key={item.id}
                              onClick={() => setActiveItem({ type: 'pdf', id: item.id })}
                              className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-3 items-center cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50/60 dark:bg-blue-950/30'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                      {item.title}
                                    </span>
                                    {item.favorite && (
                                      <Star className="w-3 h-3 text-amber-500 fill-current shrink-0" />
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {item.fileName}
                                  </div>
                                </div>
                              </div>

                              <div className="sm:col-span-3 text-xs text-slate-500 dark:text-slate-400 truncate">
                                <span>{item.category}</span>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono tabular-nums">
                                  {formatBytes(item.fileSize)}
                                </span>
                              </div>

                              <div className="sm:col-span-2 text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500 sm:text-right">
                                {formatDate(item.updatedAt)}
                              </div>

                              <div className="sm:col-span-2 flex items-center sm:justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingPdf(item);
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>View</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSharingItem({ kind: 'pdf', item });
                                  }}
                                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800"
                                  aria-label="Share encrypted link"
                                  title="Share link"
                                >
                                  <Share2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (row.kind === 'excel') {
                          const item = row.item;
                          const grandTotal = computeEntryGrandTotal(item.sheets);
                          const totalRows = item.sheets.reduce(
                            (acc, s) => acc + s.rows.length,
                            0
                          );
                          return (
                            <div
                              key={item.id}
                              onClick={() => setActiveItem({ type: 'excel', id: item.id })}
                              className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-3 items-center cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50/60 dark:bg-blue-950/30'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                      {item.title}
                                    </span>
                                    {item.favorite && (
                                      <Star className="w-3 h-3 text-amber-500 fill-current shrink-0" />
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {item.category} ·{' '}
                                    <span className="font-mono tabular-nums">
                                      {totalRows} rows
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="sm:col-span-3 text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {formatAmount(grandTotal, item.currency)}
                              </div>

                              <div className="sm:col-span-2 text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500 sm:text-right">
                                {formatDate(item.updatedAt)}
                              </div>

                              <div className="sm:col-span-2 flex items-center sm:justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingExcel(item);
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Open</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSharingItem({ kind: 'excel', item });
                                  }}
                                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800"
                                  aria-label="Share encrypted link"
                                  title="Share link"
                                >
                                  <Share2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (row.kind === 'record') {
                          const item = row.item;
                          const firstValueField = item.fields.find((f) => f.value && !f.sensitive);
                          return (
                            <div
                              key={item.id}
                              onClick={() => setActiveItem({ type: 'record', id: item.id })}
                              className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-3 items-center cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50/60 dark:bg-blue-950/30'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                                <TableProperties className="w-4 h-4 text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                      {item.title}
                                    </span>
                                    {item.favorite && (
                                      <Star className="w-3 h-3 text-amber-500 fill-current shrink-0" />
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {firstValueField
                                      ? `${firstValueField.label}: ${firstValueField.value}`
                                      : item.notes || `${item.fields.length} structured fields`}
                                  </div>
                                </div>
                              </div>

                              <div className="sm:col-span-3 text-xs text-slate-500 dark:text-slate-400 truncate">
                                <span>{item.template}</span>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono tabular-nums">
                                  {item.fields.length} fields
                                </span>
                              </div>

                              <div className="sm:col-span-2 text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500 sm:text-right">
                                {formatDate(item.updatedAt)}
                              </div>

                              <div className="sm:col-span-2 flex items-center sm:justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveItem({ type: 'record', id: item.id });
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Inspect</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSharingItem({ kind: 'record', item });
                                  }}
                                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800"
                                  aria-label="Share encrypted link"
                                  title="Share link"
                                >
                                  <Share2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // Link / URL row
                        const item = row.item;
                        const safeHref = sanitizeExternalUrl(item.url);
                        return (
                          <div
                            key={item.id}
                            onClick={() => setActiveItem({ type: 'link', id: item.id })}
                            className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-3 items-center cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-blue-50/60 dark:bg-blue-950/30'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                              <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                    {item.title}
                                  </span>
                                  {item.favorite && (
                                    <Star className="w-3 h-3 text-amber-500 fill-current shrink-0" />
                                  )}
                                </div>
                                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                                  {item.shortUrl ? `${item.shortUrl} → ${item.url}` : item.url}
                                </div>
                              </div>
                            </div>

                            <div className="sm:col-span-3 text-xs text-slate-500 dark:text-slate-400 truncate">
                              <span>{item.category}</span>
                              {item.shortSlug && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span className="font-mono text-blue-600 dark:text-blue-400">
                                    /u/{item.shortSlug}
                                  </span>
                                </>
                              )}
                              {item.tags && item.tags.length > 0 && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span>{item.tags.slice(0, 2).join(', ')}</span>
                                </>
                              )}
                            </div>

                            <div className="sm:col-span-2 text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500 sm:text-right">
                              {formatDate(item.updatedAt)}
                            </div>

                            <div className="sm:col-span-2 flex items-center sm:justify-end gap-1.5">
                              {safeHref && (
                                <a
                                  href={item.shortUrl || safeHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Open</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleQuickCopy(e, item.id, item.shortUrl || item.url)
                                }
                                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-800"
                                aria-label={item.shortUrl ? 'Copy short URL' : 'Copy URL'}
                                title={item.shortUrl ? 'Copy short URL' : 'Copy URL'}
                              >
                                {copiedRowId === item.id ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSharingItem({ kind: 'link', item });
                                }}
                                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800"
                                aria-label="Share encrypted link"
                                title="Share link"
                              >
                                <Share2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>

          {activeSection !== 'security' && (
            <InspectorPanel
              activeItem={activeItem}
              passwords={vault.passwords}
              pdfs={vault.pdfs}
              excels={vault.excels}
              records={vault.records}
              links={vault.links || []}
              onClose={() => setActiveItem(null)}
              onShareItem={(shareable) => setSharingItem(shareable)}
              onEditPassword={(entry) => {
                setEditingPassword(entry);
                setPasswordModalOpen(true);
              }}
              onDeletePassword={deletePassword}
              onToggleFavoritePassword={toggleFavoritePassword}
              onEditPdf={(entry) => {
                setEditingPdf(entry);
                setPdfModalOpen(true);
              }}
              onDeletePdf={deletePdf}
              onOpenPdfViewer={(entry) => setViewingPdf(entry)}
              onToggleFavoritePdf={toggleFavoritePdf}
              onEditExcel={(entry) => {
                setEditingExcel(entry);
                setExcelModalOpen(true);
              }}
              onDeleteExcel={deleteExcel}
              onOpenExcelViewer={(entry) => setViewingExcel(entry)}
              onToggleFavoriteExcel={toggleFavoriteExcel}
              onEditRecord={(entry) => {
                setEditingRecord(entry);
                setRecordModalOpen(true);
              }}
              onDeleteRecord={deleteRecord}
              onToggleFavoriteRecord={toggleFavoriteRecord}
              onEditLink={(entry) => {
                setEditingLink(entry);
                setLinkModalOpen(true);
              }}
              onDeleteLink={deleteLink}
              onToggleFavoriteLink={toggleFavoriteLink}
              onRevokeShortUrl={handleRevokeShortUrl}
            />
          )}
        </div>
      </div>

      {/* Creation & Edit Modals */}
      <PasswordModal
        isOpen={passwordModalOpen}
        initialEntry={editingPassword}
        onClose={() => {
          setPasswordModalOpen(false);
          setEditingPassword(null);
        }}
        onSave={savePassword}
      />

      <PdfUploadModal
        isOpen={pdfModalOpen}
        initialEntry={editingPdf}
        onClose={() => {
          setPdfModalOpen(false);
          setEditingPdf(null);
        }}
        onSave={savePdf}
      />

      <ExcelModal
        isOpen={excelModalOpen}
        initialEntry={editingExcel}
        onClose={() => {
          setExcelModalOpen(false);
          setEditingExcel(null);
        }}
        onSave={(entry) => saveExcel(entry, !editingExcel)}
      />

      <DataRecordModal
        isOpen={recordModalOpen}
        initialEntry={editingRecord}
        onClose={() => {
          setRecordModalOpen(false);
          setEditingRecord(null);
        }}
        onSave={saveRecord}
      />

      <LinkModal
        isOpen={linkModalOpen}
        initialEntry={editingLink}
        onClose={() => {
          setLinkModalOpen(false);
          setEditingLink(null);
        }}
        onSave={saveLink}
      />

      <PdfViewerModal
        pdf={viewingPdf}
        onClose={() => setViewingPdf(null)}
        onShare={(pdf) => setSharingItem({ kind: 'pdf', item: pdf })}
      />

      <ExcelViewerModal
        entry={viewingExcel}
        onClose={() => setViewingExcel(null)}
        onSaveUpdated={(updated) => saveExcel(updated, true)}
        onShare={(excel) => setSharingItem({ kind: 'excel', item: excel })}
      />

      <ShareModal
        target={sharingItem}
        onClose={() => setSharingItem(null)}
      />
    </div>
  );
}
