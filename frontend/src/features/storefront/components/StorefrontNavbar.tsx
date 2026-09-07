import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Search, 
  Menu, 
  X, 
  ShieldCheck, 
  PhoneCall, 
  Sparkles, 
  LogIn,
  ChevronDown
} from 'lucide-react';

export const StorefrontNavbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/products');
    }
  };

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'All Products & Parts', path: '/products' },
    { label: 'Smartphones', path: '/products?category=smartphones' },
    { label: 'Samsung Tabs', path: '/products?category=tablets' },
    { label: 'About Us', path: '/about' },
    { label: 'Contact', path: '/contact' },
  ];

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && (location.pathname + location.search) === path) return true;
    if (path === '/products' && location.pathname === '/products' && !location.search) return true;
    return false;
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm transition-all duration-200">
      {/* Top micro bar */}
      <div className="bg-gradient-to-r from-[#00474c] to-[#006970] text-white py-1.5 px-4 text-xs font-medium">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 sm:gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-[#00b4bb]/20 text-[#33c9cf] px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border border-[#00b4bb]/40">
              <Sparkles className="w-3 h-3 text-[#33c9cf]" /> OFFICIAL STORE
            </span>
            <span className="text-slate-200 text-xs hidden sm:inline">
              Genuine Mobiles, Samsung Galaxy Tablets & Certified Mobile Spare Parts
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-200">
            <a href="tel:+923000000000" className="flex items-center gap-1.5 hover:text-white transition-colors">
              <PhoneCall className="w-3.5 h-3.5 text-[#33c9cf]" />
              <span>Direct Support: +92 300 0000000</span>
            </a>
            <div className="h-3 w-px bg-white/20 hidden md:block" />
            <span className="hidden md:flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#33c9cf]" />
              Check & Testing Warranty
            </span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3.5 group flex-shrink-0">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-md group-hover:shadow-lg transition-all duration-300 border border-[#00b4bb]/30 bg-[#00474c] p-0.5">
              <img 
                src="/logo.png" 
                alt="Niazi Mobile Mart" 
                className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/logo.svg';
                }}
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-[#00474c]">
                  NIAZI
                </span>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-[#00b4bb]">
                  MART
                </span>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 -mt-1">
                Mobiles & Spare Parts
              </span>
            </div>
          </Link>

          {/* Search Bar (Desktop) */}
          <form 
            onSubmit={handleSearchSubmit}
            className="hidden md:flex flex-1 max-w-md mx-4 relative"
          >
            <div className="relative w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mobiles, tabs, LCDs, batteries, flexes..."
                className="w-full pl-10 pr-24 py-2.5 bg-slate-100/90 hover:bg-slate-100 focus:bg-white text-sm text-slate-800 rounded-full border border-slate-200 focus:border-[#00b4bb] focus:ring-2 focus:ring-[#00b4bb]/20 outline-none transition-all"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-[#00474c] hover:bg-[#00383c] text-white text-xs font-semibold rounded-full shadow-sm transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Nav Actions */}
          <div className="flex items-center gap-3">
            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1">
              <Link
                to="/"
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  isActive('/') 
                    ? 'text-[#00474c] bg-[#00b4bb]/10 font-bold' 
                    : 'text-slate-600 hover:text-[#00474c] hover:bg-slate-50'
                }`}
              >
                Home
              </Link>
              <Link
                to="/products"
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  location.pathname === '/products' 
                    ? 'text-[#00474c] bg-[#00b4bb]/10 font-bold' 
                    : 'text-slate-600 hover:text-[#00474c] hover:bg-slate-50'
                }`}
              >
                Products & Parts
              </Link>
              <Link
                to="/about"
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  isActive('/about') 
                    ? 'text-[#00474c] bg-[#00b4bb]/10 font-bold' 
                    : 'text-slate-600 hover:text-[#00474c] hover:bg-slate-50'
                }`}
              >
                About
              </Link>
              <Link
                to="/contact"
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  isActive('/contact') 
                    ? 'text-[#00474c] bg-[#00b4bb]/10 font-bold' 
                    : 'text-slate-600 hover:text-[#00474c] hover:bg-slate-50'
                }`}
              >
                Contact
              </Link>
            </nav>

            {/* Staff / ERP Portal Direct Link */}
            <Link
              to="/auth/login"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#00474c] bg-slate-100 hover:bg-[#00b4bb]/15 border border-slate-300 hover:border-[#00b4bb]/40 rounded-lg shadow-sm transition-all"
              title="Access Admin & Shop POS Dashboard"
            >
              <LogIn className="w-3.5 h-3.5 text-[#00b4bb]" />
              <span className="hidden sm:inline">Staff / ERP Portal</span>
              <span className="sm:hidden">Staff</span>
            </Link>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3 shadow-xl">
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products & parts..."
              className="w-full pl-10 pr-20 py-2.5 bg-slate-100 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-[#00b4bb]"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-[#00474c] text-white text-xs font-semibold rounded-md"
            >
              Search
            </button>
          </form>

          <div className="flex flex-col space-y-1 pt-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  isActive(link.path)
                    ? 'bg-[#00474c] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <Link
              to="/auth/login"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#00474c] text-white font-semibold text-sm shadow-md"
            >
              <LogIn className="w-4 h-4 text-[#33c9cf]" />
              Staff & Admin ERP Login
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
