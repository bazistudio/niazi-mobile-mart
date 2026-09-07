import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Smartphone, 
  Tablet, 
  Tv, 
  BatteryCharging, 
  Zap, 
  Volume2, 
  ArrowRight, 
  ShieldCheck, 
  CheckCircle2, 
  Wrench,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { MOCK_PRODUCTS, CATEGORIES, Product } from '@/features/storefront/data/mockProducts';
import { ProductCard } from '@/features/storefront/components/ProductCard';
import { ProductModal } from '@/features/storefront/components/ProductModal';

export const HomePage: React.FC = () => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Split featured items
  const featuredPhones = MOCK_PRODUCTS.filter(p => p.category === 'smartphones').slice(0, 4);
  const featuredTabs = MOCK_PRODUCTS.filter(p => p.category === 'tablets');
  const featuredParts = MOCK_PRODUCTS.filter(p => 
    p.category === 'lcd-panels' || 
    p.category === 'batteries' || 
    p.category === 'charging-flex' || 
    p.category === 'ringers-speakers'
  ).slice(0, 4);

  const categoryIcons: Record<string, React.ReactNode> = {
    'smartphones': <Smartphone className="w-6 h-6" />,
    'tablets': <Tablet className="w-6 h-6" />,
    'lcd-panels': <Tv className="w-6 h-6" />,
    'batteries': <BatteryCharging className="w-6 h-6" />,
    'charging-flex': <Zap className="w-6 h-6" />,
    'ringers-speakers': <Volume2 className="w-6 h-6" />,
  };

  return (
    <div className="space-y-16 lg:space-y-24 pb-16">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#00383c] via-[#00474c] to-[#001f22] text-white py-16 lg:py-24">
        {/* Glow Effects */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#00b4bb]/20 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-24 w-96 h-96 rounded-full bg-[#33c9cf]/15 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#00b4bb]/15 border border-[#00b4bb]/30 text-[#33c9cf] text-xs font-semibold tracking-wide">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Premier Mobile & Parts Hub</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
                Welcome to <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#33c9cf] via-[#00b4bb] to-white">
                  Niazi Mobile Mart
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-200 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
                Discover the latest flagship smartphones, genuine Samsung Galaxy tablets, and factory-tested mobile spare parts. Retail and technician wholesale available under one roof.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  to="/products"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-gradient-to-r from-[#00b4bb] to-[#33c9cf] hover:from-[#009da3] hover:to-[#22b7bd] text-[#00383c] font-extrabold text-sm shadow-lg shadow-[#00b4bb]/20 transition-all hover:scale-[1.02]"
                >
                  <span>Explore Full Catalog</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  to="/products?category=smartphones"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-sm transition-all"
                >
                  <Smartphone className="w-4 h-4 text-[#33c9cf]" />
                  <span>Latest Phones</span>
                </Link>

                <Link
                  to="/products?category=lcd-panels"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-sm transition-all"
                >
                  <Wrench className="w-4 h-4 text-[#33c9cf]" />
                  <span>Repair Parts</span>
                </Link>
              </div>

              {/* Badges */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10 max-w-xl mx-auto lg:mx-0">
                <div className="text-center lg:text-left">
                  <div className="text-xl sm:text-2xl font-black text-white">100%</div>
                  <div className="text-xs text-slate-300">Genuine Tested</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-xl sm:text-2xl font-black text-[#33c9cf]">Same Day</div>
                  <div className="text-xs text-slate-300">Fast Dispatch</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-xl sm:text-2xl font-black text-white">Wholesale</div>
                  <div className="text-xs text-slate-300">Technician Rates</div>
                </div>
              </div>
            </div>

            {/* Right Hero Visual Cards */}
            <div className="lg:col-span-5 relative flex justify-center">
              <div className="relative w-full max-w-md">
                {/* Background card glow */}
                <div className="absolute inset-0 bg-gradient-to-tr from-[#00b4bb]/30 to-[#33c9cf]/20 rounded-3xl blur-xl" />

                <div className="relative bg-slate-900/90 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-semibold text-slate-300">Store Spotlight</span>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#33c9cf] bg-[#00b4bb]/20 px-2.5 py-0.5 rounded-full">
                      New Arrivals
                    </span>
                  </div>

                  {/* Featured Item Preview */}
                  <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-slate-800">
                    <img
                      src="https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80"
                      alt="iPhone 15 Pro Max"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4">
                      <span className="text-xs text-[#33c9cf] font-bold">Apple Flagship</span>
                      <h4 className="text-base font-bold text-white">iPhone 15 Pro Max (256GB)</h4>
                      <p className="text-xs text-slate-300">Titanium frame, A17 Pro Chip, 48MP Triple Lens</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Link
                      to="/products?category=tablets"
                      className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center gap-3"
                    >
                      <Tablet className="w-5 h-5 text-[#33c9cf]" />
                      <div className="text-left">
                        <div className="text-xs font-bold text-white">Galaxy Tabs</div>
                        <div className="text-[10px] text-slate-400">View Models</div>
                      </div>
                    </Link>

                    <Link
                      to="/products?category=lcd-panels"
                      className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center gap-3"
                    >
                      <Tv className="w-5 h-5 text-[#33c9cf]" />
                      <div className="text-left">
                        <div className="text-xs font-bold text-white">AMOLED Screens</div>
                        <div className="text-[10px] text-slate-400">View Parts</div>
                      </div>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. CATEGORY QUICK BROWSER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-8 gap-4">
          <div>
            <span className="text-xs font-bold text-[#006970] uppercase tracking-wider">Browse by Department</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
              Store Categories
            </h2>
          </div>
          <Link
            to="/products"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#006970] hover:text-[#00474c]"
          >
            <span>View All Departments</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {CATEGORIES.filter(c => c.id !== 'all').map((cat) => (
            <Link
              key={cat.id}
              to={`/products?category=${cat.id}`}
              className="group p-5 bg-white rounded-2xl border border-slate-200/80 hover:border-[#00b4bb] shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col items-center text-center space-y-3"
            >
              <div className="w-12 h-12 rounded-xl bg-[#00474c]/5 group-hover:bg-[#00474c] text-[#00474c] group-hover:text-white transition-all flex items-center justify-center">
                {categoryIcons[cat.id]}
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-800 group-hover:text-[#00474c] transition-colors">
                  {cat.label}
                </h3>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Explore</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. FEATURED SMARTPHONES SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-8 gap-4">
          <div>
            <span className="text-xs font-bold text-[#006970] uppercase tracking-wider">Top Tier Devices</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
              Featured Smartphones
            </h2>
          </div>
          <Link
            to="/products?category=smartphones"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#006970] hover:text-[#00474c]"
          >
            <span>View All Smartphones</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredPhones.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={(p) => setSelectedProduct(p)}
            />
          ))}
        </div>
      </section>

      {/* 4. SAMSUNG GALAXY TABS SHOWCASE */}
      <section className="bg-gradient-to-r from-slate-900 to-slate-950 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-8 gap-4">
            <div>
              <span className="text-xs font-bold text-[#33c9cf] uppercase tracking-wider">Productivity & Entertainment</span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                Samsung Galaxy Tabs
              </h2>
            </div>
            <Link
              to="/products?category=tablets"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#33c9cf] hover:underline"
            >
              <span>View All Tablets</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredTabs.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={(p) => setSelectedProduct(p)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 5. MOBILE SPARE PARTS & WORKSHOP SUPPLIES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-8 gap-4">
          <div>
            <span className="text-xs font-bold text-[#006970] uppercase tracking-wider">Original Replacement Components</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
              Mobile Repair Parts & Accessories
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              LCD Panels, Batteries, Charging Flexes, and Ringers & Speakers for all major mobile brands.
            </p>
          </div>
          <Link
            to="/products"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#006970] hover:text-[#00474c]"
          >
            <span>Browse Full Parts Catalog</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredParts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={(p) => setSelectedProduct(p)}
            />
          ))}
        </div>
      </section>

      {/* 6. TECHNICIAN & WHOLESALE BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-[#00474c] to-[#006970] rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[#33c9cf] text-xs font-bold uppercase tracking-wider">
              <Wrench className="w-3.5 h-3.5" /> Mobile Repair Technicians
            </span>

            <h3 className="text-2xl sm:text-4xl font-black text-white leading-tight">
              Looking for Bulk Mobile Screens, Batteries & Sub-Boards?
            </h3>

            <p className="text-sm sm:text-base text-slate-200">
              We supply repair workshops and retail mobile shops across the city with genuine replacement parts and testing guarantees. Connect directly with our wholesale desk.
            </p>

            <div className="pt-2 flex flex-wrap gap-4">
              <a
                href="https://wa.me/923000000000?text=Hello%20Niazi%20Mobile%20Mart,%20I%20am%20a%20technician%20inquiring%20about%20bulk%20spare%20parts"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#00474c] font-black text-sm shadow-md hover:bg-slate-100 transition-colors"
              >
                <span>WhatsApp Technician Desk</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm transition-colors"
              >
                <span>Visit Our Shop</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Product Detail Modal */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
};
