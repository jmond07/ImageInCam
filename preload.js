const { contextBridge, ipcRenderer } = require('electron');

// The only things the page may ask the main process to do
contextBridge.exposeInMainWorld('api', {
  // Tell the main process whether closing the window needs a confirmation first
  setConfirmClose: (on) => ipcRenderer.send('app:confirm-close', Boolean(on)),
  // Called when the user tries to close the window and a confirmation is needed
  onCloseRequested: (callback) => ipcRenderer.on('app:close-requested', () => callback()),
  quit: () => ipcRenderer.send('app:quit'),
});