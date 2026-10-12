// Мост между окном приложения и main: настройки, статус, внешние ссылки.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveSettings: (s) => ipcRenderer.send('set-settings', s),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  setAutostart: (on) => ipcRenderer.invoke('set-autostart', on)
});
