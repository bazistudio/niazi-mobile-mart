'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Loader2, Save, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import { InventoryProduct } from '@/features/inventory/types';
import {
  selectUpdateProduct,
  selectCategories,
  selectFetchCategories,
} from '@/features/inventory/core/inventory.selectors';

const editSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  price: z.number().min(0, "Price cannot be negative"),
  purchasePrice: z.number().min(0).optional(),
  quantity: z.number().min(0, "Quantity cannot be negative"),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  brand: z.string().optional(),
  description: z.string().optional(),
  lowStockThreshold: z.number().min(0).optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface ProductEditModalProps {
  product: InventoryProduct;
  onClose: () => void;
}

export const ProductEditModal = ({ product, onClose }: ProductEditModalProps) => {
  const updateProduct = selectUpdateProduct();
  const categories = selectCategories();
  const fetchCategories = selectFetchCategories();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product.image || null);

  const { register, handleSubmit, formState: { errors } } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: product.name,
      price: product.price,
      purchasePrice: product.purchasePrice,
      quantity: product.stock,
      sku: product.sku,
      barcode: product.barcode,
      category: product.categoryId || product.category,
      brand: product.brand,
      description: product.description,
      lowStockThreshold: product.minStockThreshold,
    },
  });

  useEffect(() => {
    if (categories.length === 0) fetchCategories();
  }, [categories.length, fetchCategories]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const onSubmit = async (data: EditFormValues) => {
    try {
      setIsSubmitting(true);
      await updateProduct(product.id, {
        name: data.name,
        price: data.price,
        purchasePrice: data.purchasePrice,
        quantity: data.quantity,
        sku: data.sku,
        barcode: data.barcode,
        category: data.category,
        brand: data.brand,
        description: data.description,
        lowStockThreshold: data.lowStockThreshold,
      }, imageFile || undefined);

      toast.success(`${data.name} updated successfully`);
      onClose();
    } catch {
      // Error toast shown by global interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Edit Product</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Product Name *</label>
            <input
              {...register('name')}
              className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] focus:ring-[#006970] transition-colors"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
            <select
              {...register('category')}
              className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] transition-colors"
            >
              <option value="">Select category...</option>
              {categories.map((cat: any) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category.message}</p>}
          </div>

          {/* Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sale Price (PKR) *</label>
              <input
                type="number"
                {...register('price', { valueAsNumber: true })}
                className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] transition-colors"
              />
              {errors.price && <p className="mt-1 text-xs text-red-500">{errors.price.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Purchase (PKR)</label>
              <input
                type="number"
                {...register('purchasePrice', { valueAsNumber: true })}
                className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] transition-colors"
              />
            </div>
          </div>

          {/* Stock row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stock Quantity *</label>
              <input
                type="number"
                {...register('quantity', { valueAsNumber: true })}
                className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] transition-colors"
              />
              {errors.quantity && <p className="mt-1 text-xs text-red-500">{errors.quantity.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Low Stock Alert</label>
              <input
                type="number"
                {...register('lowStockThreshold', { valueAsNumber: true })}
                className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] transition-colors"
              />
            </div>
          </div>

          {/* SKU + Barcode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SKU</label>
              <input
                {...register('sku')}
                className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Barcode</label>
              <input
                {...register('barcode')}
                className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] transition-colors"
              />
            </div>
          </div>

          {/* Brand + Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Brand</label>
            <input
              {...register('brand')}
              className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              {...register('description')}
              rows={2}
              className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-2.5 px-4 text-sm dark:text-white focus:border-[#006970] transition-colors resize-none"
            />
          </div>

          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Product Image (optional)</label>
            <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-3 hover:border-[#006970] transition-colors">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <UploadCloud className="h-5 w-5 text-gray-400" />
                </div>
              )}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {imageFile ? imageFile.name : 'Change image...'}
              </span>
              <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-xl bg-[#006970] hover:bg-[#005a60] py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4" /> Save Changes</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductEditModal;
