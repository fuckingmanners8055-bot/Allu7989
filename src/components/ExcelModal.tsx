import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Plus, Upload, X } from 'lucide-react';
import { ExcelCategory, ExcelEntry, ExcelSheetData } from '../types/vault';
import { createId, formatBytes } from '../utils/crypto';
import {
  computeEntryGrandTotal,
  estimateSheetsByteSize,
  formatAmount,
  parseSpreadsheetFile,
} from '../utils/spreadsheet';

const EXCEL_CATEGORIES: ExcelCategory[] = [
  'Expenses & Budget',
  'Invoices & Billing',
  'Tax & Accounting',
  'Inventory & Sales',
  'Payroll',
  'Personal',
  'Other',
];

const CURRENCIES = ['₹', '$', '€', '£', 'None'];

type LedgerTemplateId = 'expense' | 'invoice' | 'budget' | 'blank';

function getIndianToday(): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

function buildTemplateSheets(templateId: LedgerTemplateId): ExcelSheetData[] {
  const today = getIndianToday();
  switch (templateId) {
    case 'invoice':
      return [
        {
          name: 'GST Invoice',
          headers: ['Item / Description', 'Qty', 'Rate (₹)', 'GST %', 'Line Total (₹)'],
          rows: [
            ['Consulting Retainer', '2', '15000', '18', '=B1*C1*(1+D1/100)'],
            ['Setup & Support', '1', '8500', '18', '=B2*C2*(1+D2/100)'],
            ['', '', '', '18', '=B3*C3*(1+D3/100)'],
          ],
          amountColumnIndices: [4],
        },
      ];
    case 'budget':
      return [
        {
          name: 'Monthly Budget',
          headers: ['Category', 'Planned (₹)', 'Actual (₹)', 'Remaining (₹)'],
          rows: [
            ['Rent & Utilities', '25000', '24200', '=B1-C1'],
            ['Groceries & Ration', '12000', '10850', '=B2-C2'],
            ['Mobile & Broadband', '1800', '1699', '=B3-C3'],
          ],
          amountColumnIndices: [2],
        },
      ];
    case 'blank':
      return [
        {
          name: 'Sheet 1',
          headers: ['Description', 'Quantity', 'Rate (₹)', 'Amount (₹)'],
          rows: [['', '', '', '=B1*C1']],
          amountColumnIndices: [3],
        },
      ];
    case 'expense':
    default:
      return [
        {
          name: 'Expenses',
          headers: ['Date (DD/MM/YYYY)', 'Description', 'Category', 'Amount (₹)'],
          rows: [
            [today, 'Office Stationery', 'Operations', '1450.00'],
            [today, 'Internet & UPI Recharge', 'Utilities', '999.00'],
          ],
          amountColumnIndices: [3],
        },
      ];
  }
}

interface ExcelModalProps {
  isOpen: boolean;
  initialEntry?: ExcelEntry | null;
  onClose: () => void;
  onSave: (entry: ExcelEntry) => void;
}

export const ExcelModal: React.FC<ExcelModalProps> = ({
  isOpen,
  initialEntry,
  onClose,
  onSave,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'upload' | 'template'>('upload');
  const [templateId, setTemplateId] = useState<LedgerTemplateId>('expense');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExcelCategory>('Expenses & Budget');
  const [currency, setCurrency] = useState('₹');
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);

  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [sheets, setSheets] = useState<ExcelSheetData[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialEntry) {
        setMode('upload');
        setTitle(initialEntry.title);
        setCategory(initialEntry.category);
        setCurrency(initialEntry.currency || '₹');
        setNotes(initialEntry.notes || '');
        setFavorite(Boolean(initialEntry.favorite));
        setFileName(initialEntry.fileName);
        setFileSize(initialEntry.fileSize);
        setSheets(initialEntry.sheets);
      } else {
        setMode('upload');
        setTemplateId('expense');
        setTitle('');
        setCategory('Expenses & Budget');
        setCurrency('₹');
        setNotes('');
        setFavorite(false);
        setFileName('');
        setFileSize(0);
        setSheets([]);
      }
      setError(null);
      setIsDragging(false);
    }
  }, [isOpen, initialEntry]);

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    const validExt = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!validExt) {
      setError('Supported formats: .xlsx, .xls, and .csv.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('Maximum spreadsheet file size is 15 MB.');
      return;
    }

    setLoadingFile(true);
    setError(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      setSheets(parsed.sheets);
      setFileName(file.name);
      setFileSize(parsed.fileSize);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.(xlsx|xls|csv)$/i, ''));
      }
    } catch {
      setError('Could not parse the selected spreadsheet file.');
    } finally {
      setLoadingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Spreadsheet title is required.');
      return;
    }

    let finalSheets = sheets;
    let finalFileName = fileName;
    let finalFileSize = fileSize;

    if (!initialEntry && mode === 'template') {
      finalSheets = buildTemplateSheets(templateId);
      finalFileName = `${title.trim().replace(/\s+/g, '-').toLowerCase()}.xlsx`;
      finalFileSize = estimateSheetsByteSize(finalSheets);
    } else if (finalSheets.length === 0) {
      setError('Upload an Excel/CSV file or switch to "Create New Sheet".');
      return;
    }

    const now = Date.now();
    const entry: ExcelEntry = {
      id: initialEntry?.id || createId('xls'),
      title: title.trim(),
      fileName: finalFileName || `${title.trim()}.xlsx`,
      fileSize: finalFileSize || estimateSheetsByteSize(finalSheets),
      category,
      currency,
      sheets: finalSheets,
      notes: notes.trim() || undefined,
      favorite,
      createdAt: initialEntry?.createdAt || now,
      updatedAt: now,
    };

    onSave(entry);
    onClose();
  };

  const previewTotal = sheets.length > 0 ? computeEntryGrandTotal(sheets) : 0;
  const totalRows = sheets.reduce((acc, s) => acc + s.rows.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-modal-title"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h2
            id="excel-modal-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {initialEntry ? 'Edit Excel Spreadsheet' : 'Add Excel / Ledger Sheet'}
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
          {!initialEntry && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('upload');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === 'upload'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Excel / CSV</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('template');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === 'template'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Sheet</span>
              </button>
            </div>
          )}

          {(mode === 'upload' || initialEntry) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Spreadsheet File (.xlsx, .xls, .csv) {initialEntry ? '' : '*'}
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-950'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {loadingFile ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Parsing spreadsheet and calculating totals...
                  </p>
                ) : sheets.length > 0 ? (
                  <div className="flex items-center justify-center gap-3 text-left">
                    <FileSpreadsheet className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {fileName}
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {sheets.length} {sheets.length === 1 ? 'sheet' : 'sheets'} · {totalRows} rows ·{' '}
                        {formatBytes(fileSize)} · Total {formatAmount(previewTotal, currency)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Upload className="w-6 h-6 mx-auto text-slate-400" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Drop an Excel or CSV file here, or click to browse
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Amounts and formulas are calculated automatically on import
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === 'template' && !initialEntry && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Starter Sheet Template
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: 'expense',
                      name: 'Expense Ledger (₹)',
                      desc: 'DD/MM/YYYY, Description, Amount',
                    },
                    {
                      id: 'invoice',
                      name: 'GST Invoice Sheet',
                      desc: 'Qty × Rate + GST % auto-calculated',
                    },
                    {
                      id: 'budget',
                      name: 'Monthly Budget (₹)',
                      desc: 'Planned vs. Actual with Remaining',
                    },
                    {
                      id: 'blank',
                      name: 'Blank Calculator Sheet',
                      desc: 'Starter grid with formula support',
                    },
                  ] as const
                ).map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setTemplateId(tpl.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      templateId === tpl.id
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {tpl.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {tpl.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Spreadsheet Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Monthly Khata, GST Invoices, Household Budget"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExcelCategory)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {EXCEL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Currency Display
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur === 'None' ? 'Plain Number (No symbol)' : cur}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Period, account reference, or billing notes..."
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
              disabled={loadingFile}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap"
            >
              {initialEntry ? 'Save Changes' : mode === 'template' ? 'Create & Open Sheet' : 'Store Spreadsheet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
