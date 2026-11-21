import * as XLSX from 'xlsx';
import { ExcelSheetData } from '../types/vault';

export function colIndexToLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export function letterToColIndex(letters: string): number {
  let col = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    col = col * 26 + (upper.charCodeAt(i) - 64);
  }
  return col - 1;
}

export function parseNumericValue(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Handle accounting negative format: (1,234.50) -> -1234.50
  const isAccountingNeg = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[$₹€£¥,\s]/g, '');

  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) {
    return null;
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return isAccountingNeg ? -num : num;
}

export function formatAmount(value: number, currency = '₹'): string {
  const absFormatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  const prefix = currency && currency !== 'None' ? currency : '';
  return value < 0 ? `-${prefix}${absFormatted}` : `${prefix}${absFormatted}`;
}

function resolveCellRef(
  ref: string,
  rows: string[][],
  visited: Set<string>
): number {
  const match = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!match) return 0;
  const colIdx = letterToColIndex(match[1]);
  const rowIdx = Number(match[2]) - 1; // 1-based data row index
  if (rowIdx < 0 || rowIdx >= rows.length || colIdx < 0) return 0;
  const raw = rows[rowIdx]?.[colIdx] ?? '';
  const evaluated = evaluateCellRaw(raw, rows, `${colIdx}:${rowIdx}`, visited);
  if (typeof evaluated === 'number') return evaluated;
  const num = parseNumericValue(String(evaluated));
  return num ?? 0;
}

function expandRange(
  startRef: string,
  endRef: string,
  rows: string[][],
  visited: Set<string>
): number[] {
  const m1 = /^([A-Za-z]+)(\d+)$/.exec(startRef.trim());
  const m2 = /^([A-Za-z]+)(\d+)$/.exec(endRef.trim());
  if (!m1 || !m2) return [];

  const c1 = letterToColIndex(m1[1]);
  const r1 = Number(m1[2]) - 1;
  const c2 = letterToColIndex(m2[1]);
  const r2 = Number(m2[2]) - 1;

  const minC = Math.max(0, Math.min(c1, c2));
  const maxC = Math.min(200, Math.max(c1, c2));
  const minR = Math.max(0, Math.min(r1, r2));
  const maxR = Math.min(rows.length - 1, Math.max(r1, r2));

  const values: number[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const raw = rows[r]?.[c] ?? '';
      const val = evaluateCellRaw(raw, rows, `${c}:${r}`, visited);
      if (typeof val === 'number') {
        values.push(val);
      } else {
        const parsed = parseNumericValue(String(val));
        if (parsed !== null) values.push(parsed);
      }
    }
  }
  return values;
}

// Safe recursive-descent arithmetic parser (supports +, -, *, /, parentheses, numbers)
function evaluateArithmetic(expr: string): number {
  let pos = 0;

  function skipWs() {
    while (pos < expr.length && /\s/.test(expr[pos])) pos++;
  }

  function parseExpression(): number {
    let val = parseTerm();
    while (true) {
      skipWs();
      if (expr[pos] === '+') {
        pos++;
        val += parseTerm();
      } else if (expr[pos] === '-') {
        pos++;
        val -= parseTerm();
      } else {
        break;
      }
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (true) {
      skipWs();
      if (expr[pos] === '*') {
        pos++;
        val *= parseFactor();
      } else if (expr[pos] === '/') {
        pos++;
        const denom = parseFactor();
        if (denom === 0) throw new Error('DIV0');
        val /= denom;
      } else {
        break;
      }
    }
    return val;
  }

  function parseFactor(): number {
    skipWs();
    if (expr[pos] === '+') {
      pos++;
      return parseFactor();
    }
    if (expr[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    if (expr[pos] === '(') {
      pos++;
      const val = parseExpression();
      skipWs();
      if (expr[pos] === ')') pos++;
      return val;
    }

    const start = pos;
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) pos++;
    if (start === pos) throw new Error('SYNTAX');
    const num = Number(expr.slice(start, pos));
    if (!Number.isFinite(num)) throw new Error('NAN');
    return num;
  }

  const result = parseExpression();
  skipWs();
  if (pos < expr.length) throw new Error('TRAILING');
  return result;
}

function evaluateCellRaw(
  raw: string,
  rows: string[][],
  cellKey: string,
  visited: Set<string>
): number | string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed.startsWith('=')) {
    return raw;
  }

  if (visited.has(cellKey)) {
    return '#REF!';
  }
  const nextVisited = new Set(visited);
  nextVisited.add(cellKey);

  try {
    let formula = trimmed.slice(1).trim();

    // Expand aggregate functions: SUM, AVERAGE/AVG, MIN, MAX, COUNT
    formula = formula.replace(
      /\b(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\s*\(([^()]+)\)/gi,
      (_match, fn: string, argsRaw: string) => {
        const parts = argsRaw.split(',').map((s) => s.trim()).filter(Boolean);
        const nums: number[] = [];
        for (const part of parts) {
          if (part.includes(':')) {
            const [sRef, eRef] = part.split(':');
            nums.push(...expandRange(sRef, eRef, rows, nextVisited));
          } else if (/^[A-Za-z]+\d+$/.test(part)) {
            nums.push(resolveCellRef(part, rows, nextVisited));
          } else {
            const n = parseNumericValue(part);
            if (n !== null) nums.push(n);
          }
        }

        const upperFn = fn.toUpperCase();
        if (upperFn === 'SUM') {
          return String(nums.reduce((a, b) => a + b, 0));
        }
        if (upperFn === 'AVERAGE' || upperFn === 'AVG') {
          return nums.length ? String(nums.reduce((a, b) => a + b, 0) / nums.length) : '0';
        }
        if (upperFn === 'MIN') {
          return nums.length ? String(Math.min(...nums)) : '0';
        }
        if (upperFn === 'MAX') {
          return nums.length ? String(Math.max(...nums)) : '0';
        }
        if (upperFn === 'COUNT') {
          return String(nums.length);
        }
        return '0';
      }
    );

    // Replace remaining cell references (e.g. B2, C3)
    formula = formula.replace(/\b([A-Za-z]+\d+)\b/g, (ref) => {
      return String(resolveCellRef(ref, rows, nextVisited));
    });

    const result = evaluateArithmetic(formula);
    return Math.round(result * 10000) / 10000;
  } catch {
    return '#ERR';
  }
}

export function evaluateCellDisplay(
  raw: string,
  rows: string[][],
  rowIdx: number,
  colIdx: number
): { display: string; numeric: number | null; isFormula: boolean; isError: boolean } {
  const isFormula = (raw ?? '').trim().startsWith('=');
  if (!isFormula) {
    const num = parseNumericValue(raw ?? '');
    return {
      display: raw ?? '',
      numeric: num,
      isFormula: false,
      isError: false,
    };
  }

  const evaluated = evaluateCellRaw(raw, rows, `${colIdx}:${rowIdx}`, new Set());
  if (typeof evaluated === 'number') {
    return {
      display: String(evaluated),
      numeric: evaluated,
      isFormula: true,
      isError: false,
    };
  }
  return {
    display: String(evaluated),
    numeric: null,
    isFormula: true,
    isError: String(evaluated).startsWith('#'),
  };
}

export interface ColumnSummary {
  colIndex: number;
  colLetter: string;
  header: string;
  sum: number;
  avg: number;
  min: number;
  max: number;
  numericCount: number;
  likelyAmount: boolean;
}

const AMOUNT_HEADER_PATTERN =
  /\b(amount|total|price|cost|fee|balance|salary|revenue|expense|income|tax|subtotal|net|gross|paid|due|budget|spend|value|charge|rate)\b/i;

export function detectDefaultAmountColumns(sheet: ExcelSheetData): number[] {
  const indices: number[] = [];
  for (let c = 0; c < sheet.headers.length; c++) {
    const header = sheet.headers[c] || '';
    let numericCount = 0;
    let hasCurrencySyntax = false;

    for (let r = 0; r < sheet.rows.length; r++) {
      const raw = sheet.rows[r]?.[c] ?? '';
      const ev = evaluateCellDisplay(raw, sheet.rows, r, c);
      if (ev.numeric !== null) {
        numericCount++;
        if (/[$₹€£¥]/.test(raw) || raw.trim().startsWith('=')) {
          hasCurrencySyntax = true;
        }
      }
    }

    if (
      numericCount > 0 &&
      (AMOUNT_HEADER_PATTERN.test(header) || hasCurrencySyntax)
    ) {
      indices.push(c);
    }
  }

  // Fallback: if no header matched amount keywords, pick the last numeric column
  if (indices.length === 0) {
    for (let c = sheet.headers.length - 1; c >= 0; c--) {
      const hasNumeric = sheet.rows.some(
        (row, r) => evaluateCellDisplay(row[c] ?? '', sheet.rows, r, c).numeric !== null
      );
      if (hasNumeric) {
        indices.push(c);
        break;
      }
    }
  }

  return indices;
}

export function computeSheetSummaries(sheet: ExcelSheetData): {
  columns: ColumnSummary[];
  activeAmountIndices: number[];
  grandTotal: number;
} {
  const columns: ColumnSummary[] = [];

  for (let c = 0; c < sheet.headers.length; c++) {
    const header = sheet.headers[c] || `Column ${colIndexToLetter(c)}`;
    const nums: number[] = [];

    for (let r = 0; r < sheet.rows.length; r++) {
      const raw = sheet.rows[r]?.[c] ?? '';
      const ev = evaluateCellDisplay(raw, sheet.rows, r, c);
      if (ev.numeric !== null) {
        nums.push(ev.numeric);
      }
    }

    if (nums.length > 0) {
      const sum = nums.reduce((a, b) => a + b, 0);
      columns.push({
        colIndex: c,
        colLetter: colIndexToLetter(c),
        header,
        sum,
        avg: sum / nums.length,
        min: Math.min(...nums),
        max: Math.max(...nums),
        numericCount: nums.length,
        likelyAmount: AMOUNT_HEADER_PATTERN.test(header),
      });
    }
  }

  const activeAmountIndices =
    sheet.amountColumnIndices && sheet.amountColumnIndices.length > 0
      ? sheet.amountColumnIndices.filter((idx) =>
          columns.some((col) => col.colIndex === idx)
        )
      : detectDefaultAmountColumns(sheet);

  const grandTotal = columns
    .filter((col) => activeAmountIndices.includes(col.colIndex))
    .reduce((acc, col) => acc + col.sum, 0);

  return {
    columns,
    activeAmountIndices,
    grandTotal,
  };
}

export function computeEntryGrandTotal(sheets: ExcelSheetData[]): number {
  if (!sheets.length) return 0;
  return sheets.reduce((sum, sheet) => {
    return sum + computeSheetSummaries(sheet).grandTotal;
  }, 0);
}

export async function parseSpreadsheetFile(
  file: File
): Promise<{ sheets: ExcelSheetData[]; fileSize: number }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheets: ExcelSheetData[] = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, {
      header: 1,
      raw: false,
      defval: '',
    });

    if (aoa.length === 0) {
      return {
        name,
        headers: ['Item', 'Qty', 'Unit Price', 'Amount'],
        rows: [['', '', '', '=B1*C1']],
        amountColumnIndices: [3],
      };
    }

    const maxCols = Math.max(
      1,
      ...aoa.map((row) => (Array.isArray(row) ? row.length : 0))
    );

    const firstRow = aoa[0] || [];
    const headers: string[] = Array.from({ length: maxCols }, (_, i) => {
      const val = String(firstRow[i] ?? '').trim();
      return val || `Column ${colIndexToLetter(i)}`;
    });

    const rows: string[][] = aoa.slice(1).map((row) =>
      Array.from({ length: maxCols }, (_, i) => String(row?.[i] ?? ''))
    );

    // Ensure at least one editable row
    if (rows.length === 0) {
      rows.push(Array.from({ length: maxCols }, () => ''));
    }

    const sheet: ExcelSheetData = {
      name,
      headers,
      rows,
    };
    sheet.amountColumnIndices = detectDefaultAmountColumns(sheet);
    return sheet;
  });

  return {
    sheets:
      sheets.length > 0
        ? sheets
        : [
            {
              name: 'Sheet 1',
              headers: ['Item', 'Amount'],
              rows: [['', '']],
              amountColumnIndices: [1],
            },
          ],
    fileSize: file.size,
  };
}

export function exportSheetsToXlsx(
  sheets: ExcelSheetData[],
  fileName: string
): void {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet, idx) => {
    const evaluatedRows = sheet.rows.map((row, rIdx) =>
      row.map((cell, cIdx) => {
        const ev = evaluateCellDisplay(cell, sheet.rows, rIdx, cIdx);
        return ev.numeric !== null && !ev.isFormula
          ? ev.numeric
          : ev.isFormula && ev.numeric !== null
          ? ev.numeric
          : ev.display;
      })
    );
    const aoa = [sheet.headers, ...evaluatedRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const safeName = (sheet.name || `Sheet ${idx + 1}`).slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  const normalized = fileName.toLowerCase().endsWith('.xlsx')
    ? fileName
    : `${fileName.replace(/\.(csv|xls)$/i, '')}.xlsx`;
  XLSX.writeFile(wb, normalized);
}

export function exportSheetToCsv(
  sheet: ExcelSheetData,
  fileName: string
): void {
  const evaluatedRows = sheet.rows.map((row, rIdx) =>
    row.map((cell, cIdx) => evaluateCellDisplay(cell, sheet.rows, rIdx, cIdx).display)
  );
  const aoa = [sheet.headers, ...evaluatedRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName.replace(/\.(xlsx|xls|csv)$/i, '')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function estimateSheetsByteSize(sheets: ExcelSheetData[]): number {
  return new Blob([JSON.stringify(sheets)]).size;
}
