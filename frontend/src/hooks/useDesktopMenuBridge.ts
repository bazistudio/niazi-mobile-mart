import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isTauriEnvironment } from '@/lib/tauri/tauriClient';
import { useTerminalStore } from '@/store/useTerminalStore';
import { useInventoryUIStore } from '@/features/inventory/store/inventory-ui.store';
import { useExpensesStore } from '@/features/expenses';

interface MenuNavPayload {
  route: string;
}

interface MenuActionPayload {
  action: string;
}

interface UseDesktopMenuBridgeOptions {
  onOpenUserGuide?: (section?: string) => void;
}

export function useDesktopMenuBridge({ onOpenUserGuide }: UseDesktopMenuBridgeOptions = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlistenNav: (() => void) | undefined;
    let unlistenAction: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        // Navigation events emitted from native menu
        unlistenNav = await listen<MenuNavPayload | string>('menu-navigate', (event) => {
          const target = typeof event.payload === 'string' ? event.payload : event.payload?.route;
          if (target && typeof target === 'string') {
            navigate(target);
          }
        });

        // Action events emitted from native menu
        unlistenAction = await listen<MenuActionPayload | string>('menu-action', (event) => {
          const action = typeof event.payload === 'string' ? event.payload : event.payload?.action;
          switch (action) {
            case 'lock_terminal':
              useTerminalStore.getState().setTerminalLocked(true);
              break;
            case 'add_product':
              useInventoryUIStore.getState().setAddProductOpen(true);
              break;
            case 'record_expense':
              useExpensesStore.getState().setGlobalModalOpen(true);
              break;
            case 'open_user_guide':
              if (onOpenUserGuide) {
                onOpenUserGuide('overview');
              }
              break;
            case 'open_user_guide_workforce':
              if (onOpenUserGuide) {
                onOpenUserGuide('workforce');
              }
              break;
            case 'open_user_guide_roles':
              if (onOpenUserGuide) {
                onOpenUserGuide('roles');
              }
              break;
            case 'open_user_guide_branches':
              if (onOpenUserGuide) {
                onOpenUserGuide('branches');
              }
              break;
            case 'open_user_guide_backup':
              if (onOpenUserGuide) {
                onOpenUserGuide('backup');
              }
              break;
            case 'open_user_guide_printer':
              if (onOpenUserGuide) {
                onOpenUserGuide('printer');
              }
              break;
            default:
              break;
          }
        });
      } catch (err) {
        console.error('[useDesktopMenuBridge] Failed to register Tauri menu listeners:', err);
      }
    };

    setupListeners();

    return () => {
      if (unlistenNav) unlistenNav();
      if (unlistenAction) unlistenAction();
    };
  }, [navigate, onOpenUserGuide]);
}
