import { app, BrowserWindow, screen } from "electron";
import path from "path";
import Store from "electron-store";
import { getSetting } from "./services/settingsManager";

// --------------------------------------------------------------------------
// Window state (size, position) is kept in-memory for the session.
// For persistence across restarts you can serialise these to electron-store.
// --------------------------------------------------------------------------
interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
  isFullScreen?: boolean;
}

const store = new Store<WindowState>({
  name: "window-state",
  defaults: {
    width: 1024,
    height: 768,
    isMaximized: false,
    isFullScreen: false
  }
});

function getInitialWindowState(): WindowState {
  const savedState = (store as any).store as WindowState;
  
  // 1. Validate minimums
  const minWidth = 1024;
  const minHeight = 680;
  
  let { width, height, x, y, isMaximized, isFullScreen } = savedState;
  
  if (!width || width < minWidth) width = minWidth;
  if (!height || height < minHeight) height = minHeight;
  
  // 2. Validate monitor bounds if x and y exist
  if (x !== undefined && y !== undefined) {
    const displays = screen.getAllDisplays();
    const isVisible = displays.some(display => {
      const bounds = display.bounds;
      // Require at least 100x100px to be visible on some monitor
      return (
        x! + width > bounds.x + 100 &&
        x! < bounds.x + bounds.width - 100 &&
        y! + height > bounds.y + 100 &&
        y! < bounds.y + bounds.height - 100
      );
    });

    if (!isVisible) {
      // Reset to center of primary display
      const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
      width = Math.round(sw * 0.85);
      height = Math.round(sh * 0.9);
      x = undefined;
      y = undefined;
    }
  } else {
    // No saved coordinates, use default size
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    width = Math.round(sw * 0.85);
    height = Math.round(sh * 0.9);
  }

  return { width, height, x, y, isMaximized, isFullScreen };
}

// --------------------------------------------------------------------------
// createWindow  –  call from main.ts after app is ready
// --------------------------------------------------------------------------
export function createWindow(): BrowserWindow {
  const state = getInitialWindowState();

  const win = new BrowserWindow({
    // ── Size & position ──────────────────────────────────────────────────
    width: state.width,
    height: state.height,
    useContentSize: true,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 680,
    center: state.x === undefined && state.y === undefined,

    // ── Appearance ───────────────────────────────────────────────────────
    title: "Tijarat Pro – Admin",
    backgroundColor: "#0a0a0a",          // matches your dark theme bg
    show: false,                          // avoid flicker; show after ready
    frame: false,                         // fully frameless on Windows/Linux
    titleBarStyle: "hidden",             // clean, frameless-style look
    trafficLightPosition: { x: 16, y: 16 }, // macOS traffic lights inset
    icon: path.join(__dirname, "../build/icon.png"),
    autoHideMenuBar: true,

    // ── Security ─────────────────────────────────────────────────────────
    webPreferences: {
      // Point to the compiled preload script
      preload: path.join(__dirname, "preload.js"),

      // Security hardening
      contextIsolation: true,           // renderer cannot access Node APIs
      nodeIntegration: false,           // no Node in renderer
      sandbox: true,                    // OS-level sandbox
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,

      // Disable features the admin panel doesn't need
      spellcheck: false,
    },
  });

  // ── Show window only when content is painted (no white flash) ──────────
  win.once("ready-to-show", () => {
    win.show();
    if (state.isFullScreen) {
      win.setFullScreen(true);
    } else if (state.isMaximized) {
      win.maximize();
    }
  });

  // ── Window state tracking ──────────────────────────────────────────────
  let saveTimeout: NodeJS.Timeout | null = null;
  
  const saveState = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(() => {
      if (!win.isDestroyed()) {
        const isFullScreen = win.isFullScreen();
        const isMaximized = win.isMaximized();
        if (isFullScreen) {
          store.set("isFullScreen", true);
        } else if (isMaximized) {
          store.set("isMaximized", true);
          store.set("isFullScreen", false);
        } else {
          const bounds = win.getBounds();
          store.set("isMaximized", false);
          store.set("isFullScreen", false);
          store.set("width", bounds.width);
          store.set("height", bounds.height);
          store.set("x", bounds.x);
          store.set("y", bounds.y);
        }
      }
    }, 500); // throttle save
  };

  win.on("resize", saveState);
  win.on("move", saveState);
  win.on("maximize", saveState);
  win.on("unmaximize", saveState);
  win.on("enter-full-screen", saveState);
  win.on("leave-full-screen", saveState);
  let isQuitting = false;
  app.on('before-quit', () => {
    isQuitting = true;
  });

  win.on("close", (event) => {
    // Check if we should close to tray instead of quitting
    if (!isQuitting && getSetting('closeToTray')) {
      event.preventDefault();
      win.hide();
      return;
    }

    // Save synchronously on close
    if (saveTimeout) clearTimeout(saveTimeout);
    if (!win.isDestroyed()) {
        const isFullScreen = win.isFullScreen();
        const isMaximized = win.isMaximized();
        if (isFullScreen) {
          store.set("isFullScreen", true);
        } else if (isMaximized) {
          store.set("isMaximized", true);
          store.set("isFullScreen", false);
        } else {
          const bounds = win.getBounds();
          store.set("isMaximized", false);
          store.set("isFullScreen", false);
          store.set("width", bounds.width);
          store.set("height", bounds.height);
          store.set("x", bounds.x);
          store.set("y", bounds.y);
        }
    }
  });

  win.on('minimize', (event: any) => {
    if (getSetting('minimizeToTray')) {
      event.preventDefault();
      win.hide();
    }
  });

  // ── IPC: custom title-bar controls ─────────────────────────────────────
  // These are handled through preload → ipcRenderer → ipcMain automatically
  // via the handlers in main.ts. Extend here if you add a custom title bar.

  return win;
}
