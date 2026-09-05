export type MenuItem = {
  label: string;
  action: string;
  shortcut?: string;
  isSeparator?: boolean;
};

export const desktopMenus: Record<string, MenuItem[]> = {
  file: [
    { label: 'New Sale', action: 'NEW_SALE', shortcut: 'Ctrl+N' },
    { label: 'New Customer', action: 'NEW_CUSTOMER' },
    { label: 'New Supplier', action: 'NEW_SUPPLIER' },
    { label: '', action: '', isSeparator: true },
    { label: 'Exit', action: 'EXIT', shortcut: 'Alt+F4' },
  ],
  view: [
    { label: 'Dashboard', action: 'GOTO_DASHBOARD', shortcut: 'F1' },
    { label: 'POS', action: 'GOTO_POS', shortcut: 'F2' },
    { label: 'Inventory', action: 'GOTO_INVENTORY', shortcut: 'F3' },
    { label: 'Customers', action: 'GOTO_CUSTOMERS', shortcut: 'F4' },
    { label: 'Suppliers', action: 'GOTO_SUPPLIERS', shortcut: 'F5' },
    { label: 'Reports', action: 'GOTO_REPORTS' },
    { label: '', action: '', isSeparator: true },
    { label: 'Shortcut Keys', action: 'OPEN_SHORTCUTS' },
  ],
  backup: [
    { label: 'Create Backup', action: 'BACKUP_CREATE' },
    { label: 'Restore Backup', action: 'BACKUP_RESTORE' },
    { label: 'Verify Backup', action: 'BACKUP_VERIFY' },
    { label: 'Open Backup Folder', action: 'BACKUP_OPEN_FOLDER' },
  ],
  help: [
    { label: 'About TijaratPro', action: 'OPEN_ABOUT' },
    { label: 'Documentation', action: 'OPEN_DOCS' },
    { label: 'Contact Support', action: 'OPEN_SUPPORT' },
    { label: 'Check Updates', action: 'CHECK_UPDATES' },
    { label: '', action: '', isSeparator: true },
    { label: 'System Information', action: 'OPEN_SYSINFO' },
  ],
};
