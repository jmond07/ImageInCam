const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const SRC_DIR = path.join(__dirname, 'src');

// Must run before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 450,
    minWidth: 400,
    minHeight: 225,
    backgroundColor: '#0f0f14',
    autoHideMenuBar: true,
    show: false,
    title: 'ImageInCam',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAspectRatio(16 / 9);
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://local/index.html');

  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' });
}

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
    console.warn('Not found:', pathname);
    return new Response('Not found', { status: 404 });
  }
});

  createWindow();
});

app.on('window-all-closed', () => app.quit());