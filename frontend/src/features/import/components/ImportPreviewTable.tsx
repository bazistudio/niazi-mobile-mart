import { ParsedInvoice, PriceData } from '../types/import.types';
import { User, Phone, Calendar, DollarSign, Package, PlusCircle, Trash2 } from 'lucide-react';

interface ImportPreviewTableProps {
  data: ParsedInvoice;
  errors: string[];
  priceOverrides: Record<string, PriceData>;
  onPriceChange: (name: string, type: 'costPrice' | 'salePrice', value: number) => void;
  onDataChange: (field: keyof ParsedInvoice, value: any) => void;
}

export const ImportPreviewTable = ({ data, errors, priceOverrides, onPriceChange, onDataChange }: ImportPreviewTableProps) => {
  const handleAddItem = () => {
    const newItem = { name: 'New Item', qty: 1, price: 0 };
    onDataChange('items', [...data.items, newItem]);
    onPriceChange('New Item', 'costPrice', 0);
    onPriceChange('New Item', 'salePrice', 0);
  };

  const handleRemoveItem = (index: number) => {
    const updatedItems = data.items.filter((_, i) => i !== index);
    onDataChange('items', updatedItems);
  };

  const handleItemFieldChange = (index: number, field: 'name' | 'qty', value: any) => {
    const updatedItems = [...data.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    onDataChange('items', updatedItems);
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 dark:text-white">Import Preview</h3>
        {errors.length > 0 ? (
          <span className="text-xs font-medium bg-red-100 text-red-700 px-2.5 py-1 rounded-full dark:bg-red-900/30 dark:text-red-400">
            {errors.length} Issue(s) Found
          </span>
        ) : (
          <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full dark:bg-emerald-900/30 dark:text-emerald-400">
            Valid Data
          </span>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Validation Errors */}
        {errors.length > 0 && (
          <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 rounded-xl">
            <h4 className="text-sm font-semibold text-red-800 dark:text-red-400 mb-2">Please fix these issues:</h4>
            <ul className="list-disc pl-5 text-sm text-red-600 dark:text-red-300 space-y-1">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Invoice Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <User className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Supplier Name</span>
            </div>
            <input 
              type="text"
              value={data.customerName === 'Unknown Customer' ? '' : data.customerName}
              onChange={(e) => onDataChange('customerName', e.target.value)}
              placeholder="Supplier Name"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#006970]"
            />
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Phone className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Phone</span>
            </div>
            <input 
              type="text"
              value={data.phone === '00000000000' ? '' : data.phone}
              onChange={(e) => onDataChange('phone', e.target.value)}
              placeholder="Phone Number"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#006970]"
            />
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Date</span>
            </div>
            <input 
              type="text"
              value={data.date}
              onChange={(e) => onDataChange('date', e.target.value)}
              placeholder="Date"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#006970]"
            />
          </div>

          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Total Due</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-700 dark:text-emerald-400">Rs</span>
              <input 
                type="number"
                min="0"
                value={data.totalAmount}
                onChange={(e) => onDataChange('totalAmount', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 text-sm font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded bg-white dark:bg-emerald-900/20 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Extracted Items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Package className="w-4 h-4 text-[#006970]" />
              Imported Items ({data.items.length})
            </h4>
            <button 
              onClick={handleAddItem}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#006970] bg-[#006970]/10 hover:bg-[#006970]/20 rounded-lg transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add Missing Item
            </button>
          </div>
          
          {data.items.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 text-sm">
              No items were extracted automatically. Click "Add Missing Item" to build your procurement list.
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-xl">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 uppercase">
                  <tr>
                    <th className="px-4 py-1.5 font-medium">Product Name</th>
                    <th className="px-4 py-1.5 font-medium text-right">Quantity</th>
                    <th className="px-4 py-1.5 font-medium text-right">Cost Price</th>
                    <th className="px-4 py-1.5 font-medium text-right">Sale Price</th>
                    <th className="px-4 py-1.5 font-medium text-right">Total Cost</th>
                    <th className="px-4 py-1.5 font-medium text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.items.map((item, idx) => {
                    const override = priceOverrides[item.name];
                    const currentCost = override?.costPrice ?? item.price;
                    const currentSale = override?.salePrice ?? (item.price * 1.20);
                    const rowTotal = currentCost * item.qty;

                    return (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-1.5 font-medium text-gray-900 dark:text-white">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleItemFieldChange(idx, 'name', e.target.value)}
                            className="w-full min-w-[150px] px-2 py-1 text-sm border border-transparent hover:border-gray-300 dark:hover:border-gray-700 rounded bg-transparent focus:bg-white dark:focus:bg-gray-900 focus:border-[#006970] focus:ring-1 focus:ring-[#006970] transition-colors"
                          />
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          <input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleItemFieldChange(idx, 'qty', parseInt(e.target.value) || 1)}
                            className="w-16 px-2 py-1 text-right text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#006970]"
                          />
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          <input
                            type="number"
                            min="0"
                            value={currentCost}
                            onChange={(e) => onPriceChange(item.name, 'costPrice', parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 text-right text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#006970]"
                          />
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          <input
                            type="number"
                            min="0"
                            value={currentSale}
                            onChange={(e) => onPriceChange(item.name, 'salePrice', parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 text-right text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#006970]"
                          />
                        </td>
                        <td className="px-4 py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">
                          Rs {rowTotal.toLocaleString()}
                        </td>
                        <td className="px-4 py-1.5 text-center">
                          <button 
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end items-center gap-4">
                <span className="text-sm font-medium text-gray-500 uppercase">Computed Total Cost:</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  Rs {data.items.reduce((acc, item) => {
                    const c = priceOverrides[item.name]?.costPrice ?? item.price;
                    return acc + (c * item.qty);
                  }, 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
