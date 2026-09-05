import React, { useState, useRef, useEffect } from 'react';
import { desktopMenus, MenuItem } from '../../../constants/desktop-menu';

type DesktopMenusProps = {
  onAction: (action: string) => void;
};

export const DesktopMenus = ({ onAction }: DesktopMenusProps) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (menuKey: string) => {
    setActiveMenu(activeMenu === menuKey ? null : menuKey);
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.isSeparator || !item.action) return;
    setActiveMenu(null);
    onAction(item.action);
  };

  return (
    <div ref={menuRef} className="flex items-center h-full text-sm text-gray-300" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {Object.entries(desktopMenus).map(([key, items]) => (
        <div key={key} className="relative h-full flex items-center">
          <button
            onClick={() => handleMenuClick(key)}
            className={`px-3 h-full hover:bg-white/10 capitalize transition-colors ${
              activeMenu === key ? 'bg-white/10 text-white' : ''
            }`}
          >
            {key}
          </button>
          
          {activeMenu === key && (
            <div className="absolute top-full left-0 min-w-[200px] bg-[#1a1a1a] border border-white/10 shadow-xl py-1 z-50 rounded-b-md">
              {items.map((item, idx) => (
                item.isSeparator ? (
                  <div key={idx} className="h-px bg-white/10 my-1 mx-2" />
                ) : (
                  <button
                    key={idx}
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left px-4 py-1.5 hover:bg-blue-600 hover:text-white flex justify-between items-center group transition-colors"
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-gray-500 group-hover:text-blue-200 text-xs tracking-wider">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                )
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
