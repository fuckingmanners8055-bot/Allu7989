import React from 'react';
import {
  FileSpreadsheet,
  FileText,
  FolderLock,
  KeyRound,
  Layers,
  Link2,
  LogOut,
  ShieldCheck,
  TableProperties,
  X,
} from 'lucide-react';
import { VaultSection } from '../types/vault';
import { formatBytes } from '../utils/crypto';

interface SidebarProps {
  activeSection: VaultSection;
  onSelectSection: (section: VaultSection) => void;
  counts: {
    all: number;
    passwords: number;
    pdfs: number;
    excels: number;
    records: number;
    links: number;
  };
  storageBytes: number;
  loginId: string | null;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  counts,
  storageBytes,
  loginId,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: {
    id: VaultSection;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }[] = [
    {
      id: 'all',
      label: 'All Items',
      icon: <Layers className="w-4 h-4 shrink-0" />,
      count: counts.all,
    },
    {
      id: 'passwords',
      label: 'Passwords',
      icon: <KeyRound className="w-4 h-4 shrink-0" />,
      count: counts.passwords,
    },
    {
      id: 'pdfs',
      label: 'PDF Documents',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      count: counts.pdfs,
    },
    {
      id: 'excels',
      label: 'Excel & Ledgers',
      icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
      count: counts.excels,
    },
    {
      id: 'records',
      label: 'Data Records',
      icon: <TableProperties className="w-4 h-4 shrink-0" />,
      count: counts.records,
    },
    {
      id: 'links',
      label: 'Links & URLs',
      icon: <Link2 className="w-4 h-4 shrink-0" />,
      count: counts.links,
    },
    {
      id: 'security',
      label: 'Settings & Backup',
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
    },
  ];

  const handleSelect = (id: VaultSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-64 select-none">
      {/* Brand header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shrink-0">
            <FolderLock className="w-4 h-4" />
          </div>
          <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            My thing
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Vault sections">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className={
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.count === 'number' && (
                <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500 ml-2">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Account & storage footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
        <div className="space-y-1">
          {loginId && (
            <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
              {loginId}
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Vault Size</span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              {formatBytes(storageBytes)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out & Lock</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">{content}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
