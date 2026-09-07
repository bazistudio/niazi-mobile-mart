import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Truck, Wrench, Award, CheckCircle, ArrowRight } from 'lucide-react';

export const AboutPage: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 space-y-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <span className="text-xs font-bold text-[#006970] uppercase tracking-wider">
          Who We Are
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900">
          About Niazi Mobile Mart
        </h1>
        <p className="text-slate-600 max-w-2xl mx-auto text-sm leading-relaxed">
          Your dependable partner for retail flagship devices, tablets, and wholesale repair components across Pakistan.
        </p>
      </div>

      {/* Story & Vision */}
      <div className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-200/80 shadow-sm space-y-6">
        <div className="space-y-4 text-slate-700 text-sm leading-relaxed">
          <p>
            Established as a comprehensive mobile trading and repair hub, <strong className="text-slate-900">Niazi Mobile Mart</strong> bridges the gap between top-quality consumer tech and high-grade technician spare parts. Whether you are looking for the latest iPhone or Samsung Galaxy series, or require original AMOLED panels and charging flexes for client repairs, our inventory is curated for performance and longevity.
          </p>
          <p>
            All products undergo rigorous pre-dispatch testing. We operate our own integrated ERP and Point of Sale infrastructure to guarantee accurate stock tracking, rapid customer checkout, and reliable after-sales support.
          </p>
        </div>

        {/* Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <ShieldCheck className="w-6 h-6 text-[#006970]" />
            <h4 className="font-bold text-slate-900 text-sm">Testing Assurance</h4>
            <p className="text-xs text-slate-500">Every panel, battery, and sub-board is verified on test jigs before handover.</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <Wrench className="w-6 h-6 text-[#006970]" />
            <h4 className="font-bold text-slate-900 text-sm">Technician Wholesale</h4>
            <p className="text-xs text-slate-500">Dedicated supplies for repair workshops with fair pricing and bulk availability.</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <Truck className="w-6 h-6 text-[#006970]" />
            <h4 className="font-bold text-slate-900 text-sm">Secure Logistics</h4>
            <p className="text-xs text-slate-500">Fast courier dispatch in protective bubble-wrap packaging nationwide.</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          to="/products"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#00474c] hover:bg-[#00383c] text-white text-xs font-bold shadow-md transition-all"
        >
          <span>Explore Inventory</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
};
