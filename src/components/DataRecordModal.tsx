import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { DataRecordEntry, RecordField, RecordTemplate } from '../types/vault';
import { createId } from '../utils/crypto';

const TEMPLATES: RecordTemplate[] = [
  'Note',
  'Identity',
  'Bank & Card',
  'API & License',
  'Custom',
];

function getDefaultFieldsForTemplate(template: RecordTemplate): RecordField[] {
  switch (template) {
    case 'Identity':
      return [
        { id: createId('fld'), label: 'Full Name', value: '', sensitive: false },
        { id: createId('fld'), label: 'Aadhaar / PAN / Passport No.', value: '', sensitive: true },
        { id: createId('fld'), label: 'Issuing Authority (UIDAI / Govt)', value: '', sensitive: false },
        { id: createId('fld'), label: 'DOB / Expiry (DD/MM/YYYY)', value: '', sensitive: false },
      ];
    case 'Bank & Card':
      return [
        { id: createId('fld'), label: 'Bank Name (e.g. SBI, HDFC)', value: '', sensitive: false },
        { id: createId('fld'), label: 'Account / Card Number', value: '', sensitive: true },
        { id: createId('fld'), label: 'IFSC Code', value: '', sensitive: false },
        { id: createId('fld'), label: 'UPI ID / Branch', value: '', sensitive: false },
        { id: createId('fld'), label: 'ATM PIN / MPIN', value: '', sensitive: true },
      ];
    case 'API & License':
      return [
        { id: createId('fld'), label: 'Service / Product', value: '', sensitive: false },
        { id: createId('fld'), label: 'API Key / License Key', value: '', sensitive: true },
        { id: createId('fld'), label: 'Environment / Host', value: '', sensitive: false },
      ];
    case 'Custom':
      return [{ id: createId('fld'), label: '', value: '', sensitive: false }];
    case 'Note':
    default:
      return [];
  }
}

interface DataRecordModalProps {
  isOpen: boolean;
  initialEntry?: DataRecordEntry | null;
  onClose: () => void;
  onSave: (entry: DataRecordEntry) => void;
}

export const DataRecordModal: React.FC<DataRecordModalProps> = ({
  isOpen,
  initialEntry,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<RecordTemplate>('Note');
  const [fields, setFields] = useState<RecordField[]>([]);
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialEntry) {
        setTitle(initialEntry.title);
        setTemplate(initialEntry.template);
        setFields(initialEntry.fields.map((f) => ({ ...f })));
        setNotes(initialEntry.notes || '');
        setFavorite(Boolean(initialEntry.favorite));
      } else {
        setTitle('');
        setTemplate('Identity');
        setFields(getDefaultFieldsForTemplate('Identity'));
        setNotes('');
        setFavorite(false);
      }
      setError(null);
    }
  }, [isOpen, initialEntry]);

  if (!isOpen) return null;

  const handleTemplateChange = (nextTemplate: RecordTemplate) => {
    setTemplate(nextTemplate);
    if (!initialEntry && fields.every((f) => !f.value.trim())) {
      setFields(getDefaultFieldsForTemplate(nextTemplate));
    }
  };

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      { id: createId('fld'), label: '', value: '', sensitive: false },
    ]);
  };

  const handleUpdateField = (id: string, patch: Partial<RecordField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const handleRemoveField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Record title is required.');
      return;
    }

    const cleanedFields = fields
      .map((f) => ({
        ...f,
        label: f.label.trim(),
        value: f.value,
      }))
      .filter((f) => f.label || f.value.trim());

    if (cleanedFields.length === 0 && !notes.trim()) {
      setError('Add at least one field or note to save this record.');
      return;
    }

    const now = Date.now();
    const entry: DataRecordEntry = {
      id: initialEntry?.id || createId('rec'),
      title: title.trim(),
      template,
      fields: cleanedFields,
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
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rec-modal-title"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h2 id="rec-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {initialEntry ? 'Edit Data Record' : 'Add Data Record'}
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
                Record Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. PAN Card, SBI Account, Home Wi-Fi, GST Key"
                autoFocus
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Record Type
              </label>
              <select
                value={template}
                onChange={(e) => handleTemplateChange(e.target.value as RecordTemplate)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {TEMPLATES.map((tpl) => (
                  <option key={tpl} value={tpl}>
                    {tpl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Structured Fields
              </span>
              <button
                type="button"
                onClick={handleAddField}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Field</span>
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                No structured fields added. Use the notes area below or click Add Field for key-value pairs.
              </p>
            ) : (
              <div className="space-y-2">
                {fields.map((field) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-12 gap-2 items-center"
                  >
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) =>
                        handleUpdateField(field.id, { label: e.target.value })
                      }
                      placeholder="Field label"
                      className="col-span-5 px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) =>
                        handleUpdateField(field.id, { value: e.target.value })
                      }
                      placeholder="Value"
                      className={`col-span-5 px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                        field.sensitive ? 'font-mono' : ''
                      }`}
                    />
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateField(field.id, { sensitive: !field.sensitive })
                        }
                        title={
                          field.sensitive
                            ? 'Marked sensitive (masked by default)'
                            : 'Visible by default (click to mask)'
                        }
                        className={`p-1.5 rounded-md border text-xs transition-colors ${
                          field.sensitive
                            ? 'border-blue-600/40 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                      >
                        {field.sensitive ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveField(field.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        aria-label="Remove field"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Secure Notes
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Write private instructions, recovery phrases, or reference details..."
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
              {initialEntry ? 'Save Changes' : 'Save Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
