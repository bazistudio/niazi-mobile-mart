import React from 'react';

export const WindowControls = () => {
  const handleMinimize = () => {
    if (window.electron) window.electron.minimize();
  };

  const handleMaximize = () => {
    if (window.electron) window.electron.maximize();
  };

  const handleClose = () => {
    if (window.electron) window.electron.close();
  };

  return (
    <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button 
        onClick={handleMinimize}
        className="px-4 h-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M11 5H1v2h10V5z"/></svg>
      </button>
      <button 
        onClick={handleMaximize}
        className="px-4 h-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" fillRule="evenodd" d="M11 2H1v8h10V2zM1 1h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" clipRule="evenodd"/></svg>
      </button>
      <button 
        onClick={handleClose}
        className="px-4 h-full hover: text-gray-400 hover:text-white transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" fillRule="evenodd" d="M7.414 6l3.536-3.536-1.414-1.414L6 4.586 2.464 1.05 1.05 2.464 4.586 6 1.05 9.536l1.414 1.414L6 7.414l3.536 3.536 1.414-1.414L7.414 6z" clipRule="evenodd"/></svg>
      </button>
    </div>
  );
};
