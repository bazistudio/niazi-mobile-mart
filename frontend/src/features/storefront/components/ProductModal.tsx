import React from 'react';
import { X, CheckCircle, Shield, PhoneCall, Star, ArrowRight, Wrench } from 'lucide-react';
import { Product, formatPKR } from '../data/mockProducts';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({ product, onClose }) => {
  if (!product) return null;

  const whatsappMessage = encodeURIComponent(
    `Hello Niazi Mobile Mart, I am interested in: ${product.name} (Price: ${formatPKR(product.price)}). Is this available in stock?`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col md:flex-row max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-100/80 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Product Image */}
        <div className="md:w-1/2 bg-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full max-h-72 object-cover rounded-2xl shadow-md"
          />
          {product.badge && (
            <span className="absolute top-4 left-4 px-3 py-1 bg-[#00474c] text-white text-xs font-bold rounded-full uppercase tracking-wider">
              {product.badge}
            </span>
          )}
        </div>

        {/* Product Info */}
        <div className="md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#006970] mb-1">
              <span>{product.brand}</span>
              <span>•</span>
              <span className="text-slate-500">{product.categoryLabel}</span>
            </div>

            <h2 className="text-xl font-black text-slate-900 leading-snug">
              {product.name}
            </h2>

            {/* Rating */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center text-amber-400">
                <Star className="w-4 h-4 fill-amber-400" />
              </div>
              <span className="text-xs font-bold text-slate-800">{product.rating}</span>
              <span className="text-xs text-slate-400">({product.reviewsCount} verified reviews)</span>
            </div>

            {/* Price block */}
            <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-baseline justify-between">
              <div>
                <span className="text-[11px] font-medium text-slate-500">Retail Price</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-[#00474c]">
                    {formatPKR(product.price)}
                  </span>
                  {product.originalPrice && (
                    <span className="text-xs text-slate-400 line-through">
                      {formatPKR(product.originalPrice)}
                    </span>
                  )}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                <CheckCircle className="w-3.5 h-3.5" /> In Stock
              </span>
            </div>

            {/* Specs List */}
            {product.specs && (
              <div className="mt-4 space-y-1.5">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Key Specifications
                </h4>
                <div className="space-y-1 text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                  {Object.entries(product.specs).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-0.5 border-b border-slate-200/50 last:border-none">
                      <span className="text-slate-500 font-medium">{key}:</span>
                      <span className="text-slate-800 font-bold">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              {product.description}
            </p>
          </div>

          {/* Action buttons */}
          <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
            <a
              href={`https://wa.me/923000000000?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-colors"
            >
              <PhoneCall className="w-4 h-4" />
              Order / Inquire via WhatsApp
            </a>

            <button
              onClick={onClose}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-medium"
            >
              Continue Browsing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
