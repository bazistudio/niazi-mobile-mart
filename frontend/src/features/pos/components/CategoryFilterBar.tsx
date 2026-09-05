'use client';

import React, { useMemo } from 'react';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';
import { LayoutGrid, Layers } from 'lucide-react';

interface CategoryFilterBarProps {
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  selectedCategoryId,
  onSelectCategory,
}) => {
  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);

  // Derive unique categories from both categories state and loaded products
  const categoryList = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();

    // Add registered categories
    if (categories && categories.length > 0) {
      categories.forEach((cat) => {
        if (cat.name) {
          map.set(cat.name.toLowerCase(), {
            id: cat.id || cat.name,
            name: cat.name,
            count: 0,
          });
        }
      });
    }

    // Tally product counts per category
    products.forEach((p) => {
      const catName = p.category || (p as any).categoryName || 'General';
      const key = catName.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          id: p.categoryId || catName,
          name: catName,
          count: 1,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, products]);

  const totalProductCount = products.length;

  return (
    <div className="w-full flex items-center gap-1.5 overflow-x-auto py-1.5 px-1 custom-scrollbar shrink-0 select-none">
      {/* "All" Category Pill */}
      <button
        type="button"
        onClick={() => onSelectCategory(null)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
          selectedCategoryId === null
            ? 'bg-primary text-white shadow-xs'
            : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>All Items</span>
        <span
          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
            selectedCategoryId === null
              ? 'bg-white/20 text-white'
              : 'bg-surface-hover text-text-muted border border-border/50'
          }`}
        >
          {totalProductCount}
        </span>
      </button>

      {/* Category Pills */}
      {categoryList.map((cat) => {
        const isSelected =
          selectedCategoryId === cat.id ||
          selectedCategoryId?.toLowerCase() === cat.name.toLowerCase();

        return (
          <button
            key={cat.id || cat.name}
            type="button"
            onClick={() => onSelectCategory(isSelected ? null : cat.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
              isSelected
                ? 'bg-primary text-white shadow-xs'
                : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Layers className="h-3.5 w-3.5 opacity-70" />
            <span>{cat.name}</span>
            {cat.count > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-surface-hover text-text-muted border border-border/50'
                }`}
              >
                {cat.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryFilterBar;
