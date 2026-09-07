import React from 'react';
import { Star, CheckCircle, ArrowRight, Shield } from 'lucide-react';
import { Product, formatPKR } from '../data/mockProducts';

interface ProductCardProps {
  product: Product;
  onSelect?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect }) => {
  return (
    <div className="group bg-white rounded-2xl border border-slate-200/80 hover:border-[#00b4bb]/50 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden relative">
      {/* Badge */}
      {product.badge && (
        <div className="absolute top-3 left-3 z-10">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-[#00474c] text-white shadow-sm">
            {product.badge}
          </span>
        </div>
      )}

      {/* Product Image Container */}
      <div className="relative w-full aspect-square bg-gradient-to-tr from-slate-50 to-slate-100 overflow-hidden flex items-center justify-center p-4">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover rounded-xl group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Content */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Category & Brand */}
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 font-medium">
            <span className="text-[#006970] font-semibold">{product.brand}</span>
            <span className="bg-slate-100 px-2 py-0.5 rounded-md text-[11px] text-slate-600">
              {product.categoryLabel}
            </span>
          </div>

          {/* Title */}
          <h3 className="font-bold text-slate-900 group-hover:text-[#00474c] transition-colors line-clamp-2 text-base leading-snug">
            {product.name}
          </h3>

          {/* Rating */}
          <div className="flex items-center gap-1.5 mt-2">
            <div className="flex items-center text-amber-400">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
            <span className="text-xs font-bold text-slate-700">{product.rating}</span>
            <span className="text-xs text-slate-400">({product.reviewsCount})</span>
            {product.inStock && (
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <CheckCircle className="w-3 h-3" /> In Stock
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-slate-500 line-clamp-2 mt-2.5 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Price & Action */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-end justify-between gap-2">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Price</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg sm:text-xl font-extrabold text-[#00474c]">
                {formatPKR(product.price)}
              </span>
              {product.originalPrice && (
                <span className="text-xs text-slate-400 line-through">
                  {formatPKR(product.originalPrice)}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelect?.(product)}
            className="inline-flex items-center justify-center gap-1 px-3.5 py-2 rounded-xl bg-[#00474c] hover:bg-[#00363a] text-white text-xs font-bold shadow-sm group-hover:shadow transition-all"
          >
            <span>Inquire</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};
