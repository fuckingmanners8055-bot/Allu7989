import React, { useEffect, useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { PdfCategory, PdfEntry } from '../types/vault';
import { createId, formatBytes } from '../utils/crypto';
import { fileToBase64 } from '../utils/storage';

const PDF_CATEGORIES: PdfCategory[] = [
  'Identity & Legal',
  'Tax & Finance',
  'Medical',
  'Work',
  'Receipts',
  'Manuals',
  'Other',
];

interface PdfUploadModalProps {
  isOpen: boolean;
  initialEntry?: PdfEntry | null;
  onClose: () => void;
  onSave: (entry: PdfEntry) => void;
}

export const PdfUploadModal: React.FC<PdfUploadModalProps> = ({
  isOpen,
  initialEntry,
  onClose,
  onSave,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PdfCategory>('Identity & Legal');
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);

  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [dataBase64, setDataBase64] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialEntry) {
        setTitle(initialEntry.title);
        setCategory(initialEntry.category);
        setNotes(initialEntry.notes || '');
        setFavorite(Boolean(initialEntry.favorite));
        setFileName(initialEntry.fileName);
        setFileSize(initialEntry.fileSize);
        setDataBase64(initialEntry.dataBase64);
      } else {
        setTitle('');
        setCategory('Identity & Legal');
        setNotes('');
        setFavorite(false);
        setFileName('');
        setFileSize(0);
        setDataBase64('');
      }
      setError(null);
      setIsDragging(false);
    }
  }, [isOpen, initialEntry]);

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('Only PDF files (.pdf) are supported in PDF Documents.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError('Maximum PDF file size is 25 MB.');
      return;
    }

    setLoadingFile(true);
    setError(null);
    try {
      const b64 = await fileToBase64(file);
      setDataBase64(b64);
      setFileName(file.name);
      setFileSize(file.size);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.pdf$/i, ''));
      }
    } catch {
      setError('Could not read the selected PDF file.');
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
    if (!dataBase64) {
      setError('Please select a PDF file to store.');
      return;
    }
    if (!title.trim()) {
      setError('Document title is required.');
      return;
    }

    const now = Date.now();
    const entry: PdfEntry = {
      id: initialEntry?.id || createId('pdf'),
      title: title.trim(),
      fileName: fileName || `${title.trim()}.pdf`,
      fileSize,
      category,
      notes: notes.trim() || undefined,
      favorite,
      dataBase64,
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
        aria-labelledby="pdf-modal-title"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h2 id="pdf-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {initialEntry ? 'Edit PDF Document' : 'Upload PDF Document'}
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
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              PDF File *
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
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              {loadingFile ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">Reading PDF file...</p>
              ) : fileName ? (
                <div className="flex items-center justify-center gap-3 text-left">
                  <FileText className="w-7 h-7 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {fileName}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {formatBytes(fileSize)} · Click to replace file
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Upload className="w-6 h-6 mx-auto text-slate-400" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Drop a PDF here, or click to browse
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Stored locally and encrypted with your vault (up to 25 MB)
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Document Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. ITR FY 2025-26, Aadhaar, PAN Card"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PdfCategory)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {PDF_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
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
              placeholder="Issuing authority, reference number, or expiration date..."
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
              {initialEntry ? 'Save Changes' : 'Store PDF'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
