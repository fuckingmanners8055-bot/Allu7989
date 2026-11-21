import React, { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { PdfEntry } from '../types/vault';
import { formatBytes, formatDate } from '../utils/crypto';
import { base64ToPdfBlobUrl, downloadBase64Pdf } from '../utils/storage';

interface PdfViewerModalProps {
  pdf: PdfEntry | null;
  onClose: () => void;
  onShare?: (pdf: PdfEntry) => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  pdf,
  onClose,
  onShare,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pdf) {
      setBlobUrl(null);
      return;
    }

    const url = base64ToPdfBlobUrl(pdf.dataBase64);
    setBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pdf]);

  if (!pdf) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs">
      <div
        className="w-full max-w-5xl h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-viewer-title"
      >
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2
              id="pdf-viewer-title"
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              {pdf.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {pdf.fileName} ·{' '}
              <span className="font-mono tabular-nums">{formatBytes(pdf.fileSize)}</span> ·{' '}
              {formatDate(pdf.updatedAt)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onShare && (
              <button
                type="button"
                onClick={() => onShare(pdf)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Link</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => downloadBase64Pdf(pdf.dataBase64, pdf.fileName)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close PDF viewer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-hidden">
          {blobUrl ? (
            <iframe
              src={blobUrl}
              title={pdf.title}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Loading PDF document...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
