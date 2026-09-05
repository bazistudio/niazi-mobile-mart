'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useInventoryFilters } from '../InventoryFilterContext';

import { useCategories } from '@/features/inventory/hooks/useCategories';
import { useBrands } from '@/features/inventory/hooks/useBrands';
import { useCompanies } from '@/features/inventory/hooks/useCompanies';
import { useColors } from '@/features/inventory/hooks/useColors';
import { useQualities } from '@/features/inventory/hooks/useQualities';

export interface MasterDataDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entity: 'category' | 'brand' | 'company' | 'color' | 'quality';
  mode?: 'create' | 'edit';
  editItem?: { id: string, name: string };
}

export function MasterDataDrawer({ isOpen, onClose, entity, mode = 'create', editItem }: MasterDataDrawerProps) {
  const { refreshMasterData } = useInventoryFilters();
  const [name, setName] = useState('');

  const { createCategory, categories } = useCategories();
  const { createBrand, brands } = useBrands();
  const { createCompany, companies } = useCompanies();
  const { createColor, colors } = useColors();
  const { createQuality, qualities } = useQualities();

  let options: { id: string, name: string }[] = [];
  switch (entity) {
    case 'category': options = categories; break;
    case 'brand': options = brands; break;
    case 'company': options = companies; break;
    case 'color': options = colors; break;
    case 'quality': options = qualities; break;
  }

  // Update name if editItem changes
  React.useEffect(() => {
    if (isOpen) {
      setName(editItem ? editItem.name : '');
    }
  }, [isOpen, editItem]);

  if (!isOpen) return null;

  const entityTitle = entity.charAt(0).toUpperCase() + entity.slice(1);
  const actionTitle = mode === 'edit' ? 'Edit' : 'Add';

  const handleSave = async () => {
    try {
      if (mode === 'create') {
        switch (entity) {
          case 'category': await createCategory({ name }); break;
          case 'brand': await createBrand({ name }); break;
          case 'company': await createCompany({ name }); break;
          case 'color': await createColor({ name }); break;
          case 'quality': await createQuality({ name }); break;
        }
      } else {
        console.log(`Update not fully wired yet: ${name}`);
      }
      
      refreshMasterData();
      setName('');
      onClose();
    } catch (err) {
      console.error('Failed to save master data', err);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-gray-900 shadow-xl flex flex-col transition-transform transform translate-x-0">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {actionTitle} {entityTitle}
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
          
          {/* Add Form */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Enter ${entity} name`}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
            />
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="mt-3 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#006970] hover:bg-[#005a60] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006970] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
          </div>

          <hr className="border-gray-200 dark:border-gray-800" />

          {/* Existing List Placeholder */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              Existing {entityTitle}s
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              {options.length === 0 ? (
                <li className="px-3 py-2 text-gray-400 italic">No {entity}s found.</li>
              ) : (
                options.map(opt => (
                  <li key={opt.id} className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-100 dark:border-gray-700/50 flex justify-between items-center group">
                    {opt.name}
                    <span className="text-xs text-[#006970] dark:text-[#00B4BB] opacity-0 group-hover:opacity-100 cursor-pointer">Edit</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          
        </div>
      </div>
    </>
  );
}
