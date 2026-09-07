import React from 'react';
import { Link } from 'react-router-dom';
import { 
  MapPin, 
  Phone, 
  Mail, 
  ShieldCheck, 
  Truck, 
  Clock, 
  Wrench,
  CheckCircle2
} from 'lucide-react';

export const StorefrontFooter: React.FC = () => {
  return (
    <footer className="bg-gradient-to-b from-slate-900 to-slate-950 text-slate-300 border-t border-slate-800">
      {/* Value Badges Banner */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-[#00474c]/60 text-[#33c9cf] border border-[#00b4bb]/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Genuine & Tested</h4>
                <p className="text-xs text-slate-400 mt-0.5">Every phone and part tested before handover</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-[#00474c]/60 text-[#33c9cf] border border-[#00b4bb]/20">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Nationwide Delivery</h4>
                <p className="text-xs text-slate-400 mt-0.5">Fast & secure courier dispatch across Pakistan</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-[#00474c]/60 text-[#33c9cf] border border-[#00b4bb]/20">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Technician Wholesale</h4>
                <p className="text-xs text-slate-400 mt-0.5">Bulk LCDs, batteries, and flexes for workshops</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-[#00474c]/60 text-[#33c9cf] border border-[#00b4bb]/20">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Quick Support</h4>
                <p className="text-xs text-slate-400 mt-0.5">Direct phone & in-shop assistance 6 days a week</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md border border-[#00b4bb]/40 bg-[#00474c] p-0.5">
                <img 
                  src="/logo.png" 
                  alt="Niazi Mobile Mart" 
                  className="w-full h-full object-cover rounded-lg"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/logo.svg';
                  }}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xl font-black tracking-tight text-white">NIAZI</span>
                <span className="text-xl font-black tracking-tight text-[#00b4bb]">MART</span>
              </div>
            </Link>

            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              Your premier retail and wholesale hub for latest flagship smartphones, Samsung Galaxy tablets, and genuine repair spare parts including displays, batteries, flexes, and speakers.
            </p>

            <div className="pt-2 text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#33c9cf]" />
                <span>Authorized Sales & Genuine Replacement Parts</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#33c9cf]" />
                <span>Dedicated Shop POS & Inventory Management System</span>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Categories
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/products?category=smartphones" className="hover:text-[#33c9cf] transition-colors">
                  Smartphones
                </Link>
              </li>
              <li>
                <Link to="/products?category=tablets" className="hover:text-[#33c9cf] transition-colors">
                  Samsung Galaxy Tabs
                </Link>
              </li>
              <li>
                <Link to="/products?category=lcd-panels" className="hover:text-[#33c9cf] transition-colors">
                  LCD & OLED Screens
                </Link>
              </li>
              <li>
                <Link to="/products?category=batteries" className="hover:text-[#33c9cf] transition-colors">
                  Replacement Batteries
                </Link>
              </li>
              <li>
                <Link to="/products?category=charging-flex" className="hover:text-[#33c9cf] transition-colors">
                  Charging Port Flexes
                </Link>
              </li>
              <li>
                <Link to="/products?category=ringers-speakers" className="hover:text-[#33c9cf] transition-colors">
                  Ringers & Speakers
                </Link>
              </li>
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Quick Navigation
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/" className="hover:text-[#33c9cf] transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/products" className="hover:text-[#33c9cf] transition-colors">
                  Catalog & Inventory
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-[#33c9cf] transition-colors">
                  About Niazi Mart
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-[#33c9cf] transition-colors">
                  Contact & Location
                </Link>
              </li>
              <li>
                <Link to="/auth/login" className="text-[#33c9cf] hover:underline font-medium">
                  Staff / Admin Login
                </Link>
              </li>
            </ul>
          </div>

          {/* Store Details */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Visit Our Shop
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5 text-slate-400">
                <MapPin className="w-4 h-4 text-[#33c9cf] mt-0.5 flex-shrink-0" />
                <span>Niazi Mobile Mart, Shop #12-14, Mobile Market Plaza, Pakistan</span>
              </li>
              <li className="flex items-center gap-2.5 text-slate-400">
                <Phone className="w-4 h-4 text-[#33c9cf] flex-shrink-0" />
                <a href="tel:+923000000000" className="hover:text-white transition-colors">
                  +92 300 0000000
                </a>
              </li>
              <li className="flex items-center gap-2.5 text-slate-400">
                <Mail className="w-4 h-4 text-[#33c9cf] flex-shrink-0" />
                <a href="mailto:info@niazimobilemart.com" className="hover:text-white transition-colors">
                  info@niazimobilemart.com
                </a>
              </li>
              <li className="text-xs text-slate-500 pt-1">
                Open Monday - Saturday: 10:30 AM - 9:30 PM
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Niazi Mobile Mart. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/about" className="hover:text-slate-400">Warranty Policy</Link>
            <Link to="/contact" className="hover:text-slate-400">Support</Link>
            <Link to="/auth/login" className="hover:text-slate-400">ERP System</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
