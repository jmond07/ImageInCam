const { app, BrowserWindow, protocol, net, shell, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const SRC_DIR = path.join(__dirname, 'src');
const TITLEBAR = 32; // height of title strip in px (same as --titlebar in style.css)

// Must run before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Keep rendering even when another window covers ImageInCam, so OBS never gets a frozen picture
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// The page tells us when closing the window needs a confirmation (only in the live view).
// If it never says so, the window just closes, so a broken page can't trap the user.
let confirmClose = false;
let quitting = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 450 + TITLEBAR, // 450 of picture + the title strip
    minWidth: 400,
    minHeight: 225 + TITLEBAR,
    backgroundColor: '#141414',
    // We draw our own title strip; Electron draws the window buttons on top of it.
    // Keep these colors in sync with --bg, --text and --titlebar in style.css.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#141414', symbolColor: '#e8e8e8', height: TITLEBAR },
    show: false,
    title: 'ImageInCam',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Links open in the real browser, and the app window never navigates away
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) event.preventDefault();
  });

  // Closing the window (X, Alt+F4): let the page ask first, when it wants to
  win.on('close', (event) => {
    if (quitting || !confirmClose) return;
    event.preventDefault();
    win.webContents.send('app:close-requested');
  });
  // If the page crashes it can't answer, so don't wait for it
  win.webContents.on('render-process-gone', () => {
    confirmClose = false;
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL('app://local/index.html');

  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' });
}

ipcMain.on('app:confirm-close', (_event, on) => {
  confirmClose = Boolean(on);
});
ipcMain.on('app:quit', () => {
  quitting = true;
  app.quit();
});
// Resizes the window so the picture area is exactly 16:9 (cleaner to crop in OBS)
ipcMain.on('app:fit-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isMaximized() || win.isFullScreen()) return;
  const [width] = win.getContentSize();
  win.setContentSize(width, Math.round((width * 9) / 16) + TITLEBAR);
});

ipcMain.handle('app:version', () => app.getVersion());

app.whenReady().then(() => {
  // Serves everything inside src/ under app://local/
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const filePath = path.join(SRC_DIR, decodeURIComponent(pathname));
    const relative = path.relative(SRC_DIR, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      if (!pathname.endsWith('.map')) console.warn('Not found:', pathname);
      return new Response('Not found', { status: 404 });
    }
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());