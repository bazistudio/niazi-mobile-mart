import { BrowserWindow } from "electron";
import path from "path";

const splashHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { 
      background-color: #0a0a0a; 
      color: #fff; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      justify-content: center; 
      height: 100vh; 
      margin: 0; 
      user-select: none; 
      overflow: hidden; 
      -webkit-app-region: drag;
    }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px; }
    p { font-size: 14px; color: #888; margin-top: 16px; transition: opacity 0.2s; }
    .spinner { 
      width: 36px; height: 36px; 
      border: 3px solid rgba(255,255,255,0.1); 
      border-radius: 50%; 
      border-top-color: #0070f3; 
      animation: spin 1s ease-in-out infinite; 
      margin-bottom: 20px; 
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h1>Tijarat Pro</h1>
  <p id="status">Starting...</p>
</body>
</html>
`;

export function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    alwaysOnTop: true,
    show: false,
    center: true,
    resizable: false,
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(splashHtml);
  win.loadURL(dataUri);
  
  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}

export function updateSplashStatus(win: BrowserWindow | null, status: string) {
  if (win && !win.isDestroyed()) {
    win.webContents.executeJavaScript(`
      document.getElementById('status').innerText = ${JSON.stringify(status)};
    `).catch(() => {}); // ignore errors if window is closing
  }
}
