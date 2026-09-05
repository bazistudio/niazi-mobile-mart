import React, { useEffect, useState } from 'react';

import { useAuthStore } from '@/lib/auth/core/auth.store';

import { UpdateModal } from './UpdateModal';

type DesktopModalsProps = {
  activeModal: 'SHORTCUTS' | 'SYSINFO' | 'ABOUT' | 'COMING_SOON' | 'DOCS' | 'SUPPORT' | 'UPDATES' | null;
  onClose: () => void;
};

export const DesktopModals = ({ activeModal, onClose }: DesktopModalsProps) => {
  const [sysInfo, setSysInfo] = useState<any>(null);
  const { user } = useAuthStore();
  const shopName = user ? (user as any).shopName || (user as any).organizationName || 'My Shop' : 'TijaratPro';

  useEffect(() => {
    if (activeModal === 'SYSINFO' && window.electron) {
      window.electron.getSystemInfo().then(setSysInfo);
    }
  }, [activeModal]);

  if (!activeModal) return null;

  if (activeModal === 'UPDATES') {
    return <UpdateModal isOpen={true} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#121212] border border-white/10 rounded-xl shadow-2xl overflow-hidden w-full max-w-md animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-[#1a1a1a]">
          <h2 className="text-lg font-semibold text-white">
            {activeModal === 'SHORTCUTS' && 'Shortcut Keys'}
            {activeModal === 'SYSINFO' && 'System Information'}
            {activeModal === 'ABOUT' && `About ${shopName}`}
            {activeModal === 'COMING_SOON' && 'Feature Coming Soon'}
            {activeModal === 'DOCS' && 'Documentation'}
            {activeModal === 'SUPPORT' && 'Contact Support'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeModal === 'SHORTCUTS' && (
            <div className="space-y-3">
              {[
                { key: 'F1', desc: 'Dashboard' },
                { key: 'F2', desc: 'POS' },
                { key: 'F3', desc: 'Inventory' },
                { key: 'F4', desc: 'Customers' },
                { key: 'F5', desc: 'Suppliers' },
                { key: 'Ctrl + N', desc: 'New Sale' },
              ].map(s => (
                <div key={s.key} className="flex justify-between items-center">
                  <span className="text-gray-300">{s.desc}</span>
                  <kbd className="px-2 py-1 bg-white/10 rounded text-sm text-gray-200 font-mono">{s.key}</kbd>
                </div>
              ))}
            </div>
          )}

          {activeModal === 'SYSINFO' && (
            <div className="space-y-4 text-sm">
              {!sysInfo ? (
                <div className="text-gray-400">Loading system information...</div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-gray-400">Application Version</span>
                    <span className="text-white">{sysInfo.appVersion}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-gray-400">Electron Version</span>
                    <span className="text-white">{sysInfo.electronVersion}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-gray-400">Node Version</span>
                    <span className="text-white">{sysInfo.nodeVersion}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-gray-400">Platform</span>
                    <span className="text-white">{sysInfo.platform} ({sysInfo.arch})</span>
                  </div>
                  {sysInfo.memoryUsage && (
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-gray-400">Memory Usage</span>
                      <span className="text-white">
                        {Math.round(sysInfo.memoryUsage.total / 1024)} MB
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeModal === 'ABOUT' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-blue-500/20">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{shopName} ERP</h3>
                <p className="text-blue-400 font-medium">Desktop Edition</p>
                <p className="text-sm text-gray-400 mt-1">Version: 1.0.0 Pilot</p>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4 text-left text-sm mt-4">
                <p className="text-gray-300 font-semibold mb-2">Modules Included:</p>
                <div className="grid grid-cols-2 gap-2 text-gray-400">
                  <div className="flex items-center gap-2"><span className="text-blue-500">✓</span> POS</div>
                  <div className="flex items-center gap-2"><span className="text-blue-500">✓</span> Inventory</div>
                  <div className="flex items-center gap-2"><span className="text-blue-500">✓</span> Customers</div>
                  <div className="flex items-center gap-2"><span className="text-blue-500">✓</span> Suppliers</div>
                  <div className="flex items-center gap-2"><span className="text-blue-500">✓</span> Reports</div>
                </div>
              </div>

              <div className="text-sm text-gray-500 pt-4 border-t border-white/10">
                <p>Database: SQLite Local</p>
                <p className="mt-2">Developer: Bazi Studio</p>
                <p>WhatsApp: 03325220620</p>
                <p className="mt-4 text-xs">© 2026 {shopName}</p>
              </div>
            </div>
          )}

          {activeModal === 'DOCS' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-purple-600/20 rounded-full mx-auto flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Documentation</h3>
                <p className="text-gray-400 mt-2 text-sm leading-relaxed">
                  The official documentation portal is currently being compiled for the V1 release.
                </p>
              </div>
            </div>
          )}

          {activeModal === 'SUPPORT' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-blue-600/20 rounded-full mx-auto flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Contact Support</h3>
                <p className="text-gray-400 mt-2 text-sm leading-relaxed">
                  Need help with {shopName}? Our support team is ready to assist you.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-left text-sm mt-4 text-gray-300">
                <p className="font-semibold text-white mb-2">Support Channels:</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">📞 <span className="text-blue-400">03325220620</span></li>
                  <li className="flex items-center gap-2">✉️ <span className="text-blue-400">support@tijaratpro.com</span></li>
                </ul>
              </div>
            </div>
          )}

          {activeModal === 'COMING_SOON' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-600/20 rounded-full mx-auto flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Backup Center</h3>
                <p className="text-gray-400 mt-2 text-sm leading-relaxed">
                  Backup management will be available in the next desktop update.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-left text-sm mt-4 text-gray-300">
                <p className="font-semibold text-white mb-2">Planned Features:</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> Manual & Automatic Backups</li>
                  <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> Disaster Recovery Restore</li>
                  <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> Integrity Verification</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#1a1a1a] flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
