import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Download,
  Plus,
  Save,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { ExcelEntry, ExcelSheetData } from '../types/vault';
import {
  colIndexToLetter,
  computeSheetSummaries,
  estimateSheetsByteSize,
  evaluateCellDisplay,
  exportSheetsToXlsx,
  exportSheetToCsv,
  formatAmount,
} from '../utils/spreadsheet';

const CURRENCIES = ['₹', '$', '€', '£', 'None'];

interface ExcelViewerModalProps {
  entry: ExcelEntry | null;
  onClose: () => void;
  onSaveUpdated: (updated: ExcelEntry) => void;
  onShare?: (entry: ExcelEntry) => void;
}

export const ExcelViewerModal: React.FC<ExcelViewerModalProps> = ({
  entry,
  onClose,
  onSaveUpdated,
  onShare,
}) => {
  const [sheets, setSheets] = useState<ExcelSheetData[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [currency, setCurrency] = useState('₹');
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(
    null
  );
  const [dirty, setDirty] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (entry) {
      setSheets(
        entry.sheets.map((s) => ({
          name: s.name,
          headers: [...s.headers],
          rows: s.rows.map((r) => [...r]),
          amountColumnIndices: s.amountColumnIndices
            ? [...s.amountColumnIndices]
            : undefined,
        }))
      );
      setCurrency(entry.currency || '₹');
      setActiveSheetIdx(0);
      setFocusedCell(null);
      setDirty(false);
      setSavedNotice(false);
    }
  }, [entry]);

  const currentSheet = sheets[activeSheetIdx] || null;

  const summary = useMemo(() => {
    if (!currentSheet) {
      return { columns: [], activeAmountIndices: [], grandTotal: 0 };
    }
    return computeSheetSummaries(currentSheet);
  }, [currentSheet]);

  if (!entry || !currentSheet) return null;

  const updateCurrentSheet = (updater: (sheet: ExcelSheetData) => ExcelSheetData) => {
    setSheets((prev) =>
      prev.map((s, idx) => (idx === activeSheetIdx ? updater(s) : s))
    );
    setDirty(true);
    setSavedNotice(false);
  };

  const handleCellChange = (rowIdx: number, colIdx: number, value: string) => {
    updateCurrentSheet((sheet) => {
      const nextRows = sheet.rows.map((r, idx) =>
        idx === rowIdx ? r.map((c, cIdx) => (cIdx === colIdx ? value : c)) : r
      );
      return { ...sheet, rows: nextRows };
    });
  };

  const handleHeaderChange = (colIdx: number, value: string) => {
    updateCurrentSheet((sheet) => ({
      ...sheet,
      headers: sheet.headers.map((h, idx) => (idx === colIdx ? value : h)),
    }));
  };

  const handleAddRow = () => {
    updateCurrentSheet((sheet) => {
      const lastRowIdx = sheet.rows.length - 1;
      const lastRow = lastRowIdx >= 0 ? sheet.rows[lastRowIdx] : [];
      const nextRowNum = sheet.rows.length + 1;

      // Smart formula carry-down: if previous row had e.g. =B1*C1, shift row numbers to nextRowNum
      const newRow = sheet.headers.map((_, cIdx) => {
        const prevCell = lastRow[cIdx] ?? '';
        if (prevCell.trim().startsWith('=') && !/\b(SUM|AVG|AVERAGE|MIN|MAX|COUNT)\b/i.test(prevCell)) {
          return prevCell.replace(/\b([A-Za-z]+)(\d+)\b/g, (_m, col: string, rowNum: string) => {
            const shifted = Number(rowNum) + 1;
            return `${col}${Number.isFinite(shifted) ? shifted : nextRowNum}`;
          });
        }
        return '';
      });

      return { ...sheet, rows: [...sheet.rows, newRow] };
    });
  };

  const handleDeleteRow = (rowIdx: number) => {
    updateCurrentSheet((sheet) => {
      if (sheet.rows.length <= 1) {
        return {
          ...sheet,
          rows: [sheet.headers.map(() => '')],
        };
      }
      return {
        ...sheet,
        rows: sheet.rows.filter((_, idx) => idx !== rowIdx),
      };
    });
  };

  const handleAddColumn = () => {
    updateCurrentSheet((sheet) => {
      const nextColLetter = colIndexToLetter(sheet.headers.length);
      return {
        ...sheet,
        headers: [...sheet.headers, `Column ${nextColLetter}`],
        rows: sheet.rows.map((r) => [...r, '']),
      };
    });
  };

  const toggleAmountColumn = (colIdx: number) => {
    updateCurrentSheet((sheet) => {
      const current = new Set(summary.activeAmountIndices);
      if (current.has(colIdx)) {
        current.delete(colIdx);
      } else {
        current.add(colIdx);
      }
      return {
        ...sheet,
        amountColumnIndices: Array.from(current).sort((a, b) => a - b),
      };
    });
  };

  const handleSave = () => {
    const updated: ExcelEntry = {
      ...entry,
      currency,
      sheets,
      fileSize: estimateSheetsByteSize(sheets),
      updatedAt: Date.now(),
    };
    onSaveUpdated(updated);
    setDirty(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-slate-950/70 backdrop-blur-xs">
      <div
        className="w-full max-w-6xl h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-viewer-title"
      >
        {/* Top bar */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="excel-viewer-title"
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              {entry.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {entry.fileName} · {currentSheet.rows.length} rows · Formulas supported (e.g.{' '}
              <code className="font-mono">=B1*C1</code>, <code className="font-mono">=SUM(D1:D5)</code>)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setDirty(true);
              }}
              aria-label="Currency format"
              className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
            >
              {CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur === 'None' ? 'No Symbol' : `Currency: ${cur}`}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty && !savedNotice}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                savedNotice
                  ? 'bg-emerald-600 text-white'
                  : dirty
                  ? 'bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500'
                  : 'border border-slate-200 dark:border-slate-700 text-slate-400 cursor-default'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savedNotice ? 'Saved' : 'Save Changes'}</span>
            </button>

            <button
              type="button"
              onClick={() => exportSheetsToXlsx(sheets, entry.fileName)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .XLSX</span>
            </button>

            <button
              type="button"
              onClick={() => exportSheetToCsv(currentSheet, entry.fileName)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              .CSV
            </button>

            {onShare && (
              <button
                type="button"
                onClick={() => onShare(entry)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Link</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close spreadsheet viewer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Automatic Amount Calculation Summary Strip */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Automatic Total Amount
              </div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatAmount(summary.grandTotal, currency)}
              </div>
            </div>
          </div>

          {summary.columns.length > 0 && (
            <div className="flex flex-wrap items-center gap-4">
              {summary.columns.map((col) => {
                const isSelected = summary.activeAmountIndices.includes(col.colIndex);
                return (
                  <button
                    key={col.colIndex}
                    type="button"
                    onClick={() => toggleAmountColumn(col.colIndex)}
                    title="Click to include or exclude this column from Grand Total"
                    className={`text-left px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                      isSelected
                        ? 'border-blue-600/40 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                        : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate max-w-[120px]">
                        {col.header}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        ({col.colLetter})
                      </span>
                    </div>
                    <div className="font-mono tabular-nums font-semibold mt-0.5">
                      {formatAmount(col.sum, currency)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sheet Tabs + Row/Col Actions */}
        <div className="px-5 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto">
            {sheets.map((sheet, idx) => (
              <button
                key={`${sheet.name}-${idx}`}
                type="button"
                onClick={() => setActiveSheetIdx(idx)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  idx === activeSheetIdx
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {sheet.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>
            <button
              type="button"
              onClick={handleAddColumn}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Column</span>
            </button>
          </div>
        </div>

        {/* Editable Spreadsheet Table */}
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-900">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
              {/* Column letters row */}
              <tr>
                <th className="w-10 px-2 py-1 border-b border-r border-slate-200 dark:border-slate-800 text-center font-mono text-[11px] text-slate-400">
                  #
                </th>
                {currentSheet.headers.map((_, cIdx) => (
                  <th
                    key={`letter-${cIdx}`}
                    className="min-w-[140px] px-2 py-1 border-b border-r border-slate-200 dark:border-slate-800 text-center font-mono text-[11px] font-medium text-slate-400"
                  >
                    {colIndexToLetter(cIdx)}
                  </th>
                ))}
                <th className="w-9 border-b border-slate-200 dark:border-slate-800" />
              </tr>

              {/* Editable Header Titles */}
              <tr>
                <th className="px-2 py-2 border-b border-r border-slate-200 dark:border-slate-800 text-center font-mono text-[11px] text-slate-400">
                  Hdr
                </th>
                {currentSheet.headers.map((header, cIdx) => (
                  <th
                    key={`hdr-${cIdx}`}
                    className="p-0 border-b border-r border-slate-200 dark:border-slate-800"
                  >
                    <input
                      type="text"
                      value={header}
                      onChange={(e) => handleHeaderChange(cIdx, e.target.value)}
                      className="w-full px-3 py-2 bg-transparent font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:bg-blue-50/50 dark:focus:bg-blue-950/30"
                    />
                  </th>
                ))}
                <th className="border-b border-slate-200 dark:border-slate-800" />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {currentSheet.rows.map((row, rIdx) => (
                <tr
                  key={`row-${rIdx}`}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                >
                  <td className="px-2 py-1.5 border-r border-slate-200 dark:border-slate-800 text-center font-mono tabular-nums text-slate-400 select-none">
                    {rIdx + 1}
                  </td>
                  {currentSheet.headers.map((_, cIdx) => {
                    const rawVal = row[cIdx] ?? '';
                    const isFocused =
                      focusedCell?.row === rIdx && focusedCell?.col === cIdx;
                    const evaluated = evaluateCellDisplay(
                      rawVal,
                      currentSheet.rows,
                      rIdx,
                      cIdx
                    );
                    const isAmountCol = summary.activeAmountIndices.includes(cIdx);
                    const displayValue = isFocused
                      ? rawVal
                      : evaluated.numeric !== null && isAmountCol
                      ? formatAmount(evaluated.numeric, currency)
                      : evaluated.display;

                    return (
                      <td
                        key={`cell-${rIdx}-${cIdx}`}
                        className="p-0 border-r border-slate-200 dark:border-slate-800"
                      >
                        <input
                          type="text"
                          value={displayValue}
                          onFocus={() => setFocusedCell({ row: rIdx, col: cIdx })}
                          onBlur={() => setFocusedCell(null)}
                          onChange={(e) =>
                            handleCellChange(rIdx, cIdx, e.target.value)
                          }
                          className={`w-full px-3 py-2 bg-transparent focus:outline-none focus:bg-blue-50/60 dark:focus:bg-blue-950/30 ${
                            evaluated.isError
                              ? 'text-red-600 dark:text-red-400 font-mono'
                              : evaluated.numeric !== null
                              ? 'text-right font-mono tabular-nums text-slate-900 dark:text-slate-100'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-1.5 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(rIdx)}
                      className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label={`Delete row ${rIdx + 1}`}
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Automatic Column Totals Footer */}
            <tfoot className="sticky bottom-0 bg-slate-50 dark:bg-slate-950 border-t-2 border-slate-200 dark:border-slate-800">
              <tr>
                <td className="px-2 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center font-mono text-[11px] font-semibold text-slate-500">
                  SUM
                </td>
                {currentSheet.headers.map((_, cIdx) => {
                  const colStat = summary.columns.find((c) => c.colIndex === cIdx);
                  const isAmountCol = summary.activeAmountIndices.includes(cIdx);
                  return (
                    <td
                      key={`sum-${cIdx}`}
                      className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100"
                    >
                      {colStat
                        ? isAmountCol
                          ? formatAmount(colStat.sum, currency)
                          : new Intl.NumberFormat('en-IN', {
                              maximumFractionDigits: 2,
                            }).format(colStat.sum)
                        : '—'}
                    </td>
                  );
                })}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
