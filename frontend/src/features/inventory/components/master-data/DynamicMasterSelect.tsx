'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Check, X, Settings, Pencil, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useMasterData } from '@/features/inventory/hooks/useMasterData';

export interface MasterOption {
  id: string;
  name: string;
}

export interface DynamicMasterSelectProps {
  entity: 'category' | 'brand' | 'company' | 'color' | 'quality';
  value: string;
  onChange: (id: string) => void;
  hideAllOption?: boolean;
  showAddButton?: boolean;
}

// ─── Manage Panel (rendered via portal) ──────────────────────────────────────
interface ManagePanelProps {
  entity: string;
  options: MasterOption[];
  currentValue: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  updateOption: (args: { id: string; data: { name: string } }) => Promise<any>;
  deleteOption: (id: string) => Promise<any>;
  createOption: (data: any) => Promise<any>;
  isUpdating: boolean;
  isDeleting: boolean;
  isCreating: boolean;
  anchorEl: HTMLButtonElement | null;
}

function ManagePanel({
  entity,
  options,
  currentValue,
  onClose,
  onSelect,
  updateOption,
  deleteOption,
  createOption,
  isUpdating,
  isDeleting,
  isCreating,
  anchorEl,
}: ManagePanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position panel near anchor
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 });

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const panelWidth = 340;
      let left = rect.left;
      if (left + panelWidth > window.innerWidth - 16) {
        left = window.innerWidth - panelWidth - 16;
      }
      let top = rect.bottom + 8;
      if (top + 420 > window.innerHeight) {
        top = rect.top - 420 - 8;
        if (top < 8) top = 8;
      }
      setPos({ top, left, width: panelWidth });
    }
  }, [anchorEl]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Focus edit input
  useEffect(() => {
    if (editingId && editInputRef.current) editInputRef.current.focus();
  }, [editingId]);

  // Focus new input
  useEffect(() => {
    if (isAddingNew && newInputRef.current) newInputRef.current.focus();
  }, [isAddingNew]);

  const handleStartEdit = (opt: MasterOption) => {
    setEditingId(opt.id);
    setEditName(opt.name);
    setEditError('');
    setDeleteConfirmId(null);
    setDeleteError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingId) return;
    try {
      setEditError('');
      await updateOption({ id: editingId, data: { name: editName.trim() } });
      setEditingId(null);
      setEditName('');
    } catch (err: any) {
      setEditError(err.response?.data?.message || err.message || 'Failed to update');
    }
  };

  const handleDeleteConfirm = (id: string) => {
    setDeleteConfirmId(id);
    setDeleteError('');
    setEditingId(null);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
    setDeleteError('');
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleteError('');
      await deleteOption(id);
      // If deleted item was selected, clear it
      if (currentValue === id) onSelect('');
      setDeleteConfirmId(null);
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || err.message || 'Failed to delete');
    }
  };

  const handleAddNew = async () => {
    if (!newName.trim()) {
      setNewError('Name is required');
      return;
    }
    try {
      setNewError('');
      const name = newName.trim();
      const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 10) + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
      const payload: any = { name, status: 'active' };
      if (entity === 'brand') payload.brandCode = code;
      if (entity === 'company') payload.companyCode = code;
      if (entity === 'quality') payload.qualityCode = code;
      if (entity === 'color') payload.hexCode = '#000000';
      const result = await createOption(payload);
      if (result?.id) onSelect(result.id);
      setIsAddingNew(false);
      setNewName('');
    } catch (err: any) {
      setNewError(err.response?.data?.message || err.message || 'Failed to create');
    }
  };

  const entityLabel = entity.charAt(0).toUpperCase() + entity.slice(1);

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
      className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#006970]" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Manage {entityLabel}s
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
        {options.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            No {entityLabel}s yet. Add one below.
          </div>
        )}

        {options.map((opt) => {
          if (deleteConfirmId === opt.id) {
            return (
              <div key={opt.id} className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Delete &quot;{opt.name}&quot;?
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      This action cannot be undone.
                    </p>
                    {deleteError && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{deleteError}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={handleCancelDelete}
                    className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(opt.id)}
                    disabled={isDeleting}
                    className="px-3 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Delete
                  </button>
                </div>
              </div>
            );
          }

          if (editingId === opt.id) {
            return (
              <div key={opt.id} className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-blue-50/50 dark:bg-blue-900/10">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => { setEditName(e.target.value); setEditError(''); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  disabled={isUpdating}
                  className="block w-full px-2 py-1.5 text-sm border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#006970] focus:border-[#006970] mb-1.5"
                />
                {editError && <p className="text-xs text-red-500 mb-1">{editError}</p>}
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={handleCancelEdit}
                    className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isUpdating}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-[#006970] hover:bg-[#005a60] rounded disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={opt.id}
              className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/40 group transition-colors"
            >
              <button
                onClick={() => { onSelect(opt.id); onClose(); }}
                className="flex items-center gap-2 flex-1 text-left min-w-0"
              >
                {currentValue === opt.id && (
                  <Check className="w-3.5 h-3.5 text-[#006970] flex-shrink-0" />
                )}
                <span className={`text-sm truncate ${currentValue === opt.id ? 'font-semibold text-[#006970]' : 'text-gray-700 dark:text-gray-200'}`}>
                  {opt.name}
                </span>
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => handleStartEdit(opt)}
                  className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                  title={`Edit ${entity}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteConfirm(opt.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                  title={`Delete ${entity}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add New */}
      <div className="border-t border-gray-100 dark:border-gray-800 p-3">
        {isAddingNew ? (
          <div>
            <input
              ref={newInputRef}
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setNewError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleAddNew(); }
                if (e.key === 'Escape') { setIsAddingNew(false); setNewName(''); setNewError(''); }
              }}
              placeholder={`New ${entity} name...`}
              disabled={isCreating}
              className={`block w-full px-3 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#006970] focus:border-[#006970] mb-1.5 ${newError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'}`}
            />
            {newError && <p className="text-xs text-red-500 mb-1.5">{newError}</p>}
            <div className="flex gap-1.5">
              <button
                onClick={() => { setIsAddingNew(false); setNewName(''); setNewError(''); }}
                className="flex-1 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNew}
                disabled={isCreating}
                className="flex-1 py-1.5 text-xs font-medium text-white bg-[#006970] hover:bg-[#005a60] rounded-md disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
              >
                {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingNew(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#006970] dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add New {entityLabel}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DynamicMasterSelect({
  entity,
  value,
  onChange,
  hideAllOption = false,
  showAddButton = false,
}: DynamicMasterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isCreatingMode, setIsCreatingMode] = useState(false);
  const [newEntityName, setNewEntityName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const gearButtonRef = useRef<HTMLButtonElement>(null);

  const { options, isLoading, createOption, isCreating, updateOption, isUpdating, deleteOption, isDeleting } = useMasterData(entity);

  // Focus inline create input
  useEffect(() => {
    if (isCreatingMode && inputRef.current) inputRef.current.focus();
  }, [isCreatingMode]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        !isManageOpen
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isManageOpen]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
  };

  const openCreateMode = () => {
    setIsOpen(false);
    setNewEntityName('');
    setError('');
    setIsCreatingMode(true);
  };

  const handleCancel = () => {
    setIsCreatingMode(false);
    setNewEntityName('');
    setError('');
  };

  const handleCreate = async () => {
    if (!newEntityName.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setError('');
      const name = newEntityName.trim();
      const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 10) + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
      const payload: any = { name, status: 'active' };
      if (entity === 'brand') payload.brandCode = code;
      if (entity === 'company') payload.companyCode = code;
      if (entity === 'quality') payload.qualityCode = code;
      if (entity === 'color') payload.hexCode = '#000000';
      const result = await createOption(payload);
      if (result?.id) onChange(result.id);
      setIsCreatingMode(false);
      setNewEntityName('');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create');
    }
  };

  // ── Inline create mode ──
  if (isCreatingMode) {
    return (
      <div ref={containerRef} className="flex items-center gap-1 w-full relative">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={newEntityName}
            onChange={(e) => { setNewEntityName(e.target.value); setError(''); }}
            placeholder={`New ${entity} name...`}
            className={`block w-full px-3 py-1.5 border rounded shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
              else if (e.key === 'Escape') handleCancel();
            }}
            disabled={isCreating}
          />
        </div>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); handleCreate(); }}
          disabled={isCreating}
          className="p-1.5 text-white bg-[#006970] hover:bg-[#005a60] border border-transparent rounded shadow-sm disabled:opacity-50 transition-colors flex-shrink-0"
          title="Save"
        >
          {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); handleCancel(); }}
          disabled={isCreating}
          className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded shadow-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 transition-colors flex-shrink-0"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
        {error && <span className="absolute -bottom-5 left-0 text-[10px] text-red-500">{error}</span>}
      </div>
    );
  }

  const mergedOptions = Array.isArray(options) ? options : [];
  const selectedOption = mergedOptions.find((opt: MasterOption) => opt.id === value);
  const defaultLabel = hideAllOption ? `Select ${entity}` : entity.charAt(0).toUpperCase() + entity.slice(1);
  const displayLabel = selectedOption ? selectedOption.name : defaultLabel;

  return (
    <div ref={containerRef} className="flex items-center gap-1 w-full">
      {/* Dropdown */}
      <div className="relative inline-block text-left flex-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          className="inline-flex justify-between items-center w-full min-w-[120px] px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 focus:outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="w-4 h-4 ml-2 -mr-1 flex-shrink-0" />
        </button>

        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute z-30 w-48 mt-1 origin-top-left bg-white border border-gray-200 divide-y divide-gray-100 rounded shadow-lg dark:bg-gray-800 dark:border-gray-700 dark:divide-gray-700"
          >
            <div className="py-1 max-h-48 overflow-y-auto">
              {!hideAllOption && (
                <button
                  onClick={() => handleSelect('')}
                  type="button"
                  className={`w-full text-left px-4 py-2 text-sm ${!value ? 'bg-gray-100 text-gray-900 font-semibold dark:bg-gray-700 dark:text-white' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                >
                  All {entity}s
                </button>
              )}
              {mergedOptions.map((opt: MasterOption) => (
                <button
                  key={opt.id}
                  onClick={() => handleSelect(opt.id)}
                  type="button"
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${value === opt.id ? 'bg-gray-100 text-gray-900 font-semibold dark:bg-gray-700 dark:text-white' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {value === opt.id && <Check className="w-3 h-3 text-[#006970] flex-shrink-0" />}
                  <span className="truncate">{opt.name}</span>
                </button>
              ))}
              {mergedOptions.length === 0 && !isLoading && (
                <p className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">No {entity}s found</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* + Create button */}
      {showAddButton && (
        <button
          onClick={openCreateMode}
          type="button"
          className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded shadow-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          title={`Add ${entity}`}
        >
          <Plus className="w-4 h-4" />
        </button>
      )}

      {/* ⚙ Manage button */}
      {showAddButton && (
        <button
          ref={gearButtonRef}
          onClick={() => { setIsOpen(false); setIsManageOpen(true); }}
          type="button"
          className="p-1.5 text-gray-500 bg-gray-100 hover:bg-[#006970] hover:text-white border border-gray-300 rounded shadow-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-[#006970] dark:hover:text-white transition-colors flex-shrink-0"
          title={`Manage ${entity}s`}
        >
          <Settings className="w-4 h-4" />
        </button>
      )}

      {/* Manage Panel Portal */}
      {isManageOpen && (
        <ManagePanel
          entity={entity}
          options={mergedOptions}
          currentValue={value}
          onClose={() => setIsManageOpen(false)}
          onSelect={onChange}
          updateOption={updateOption}
          deleteOption={deleteOption as (id: string) => Promise<any>}
          createOption={createOption}
          isUpdating={isUpdating}
          isDeleting={isDeleting}
          isCreating={isCreating}
          anchorEl={gearButtonRef.current}
        />
      )}
    </div>
  );
}
