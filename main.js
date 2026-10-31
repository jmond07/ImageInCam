const { app, BrowserWindow } = require('electron');
const path = require('path');

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
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());