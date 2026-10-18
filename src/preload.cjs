const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('vireun', {
  pathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file && file.path ? file.path : '';
    }
  },
  payload() {
    return ipcRenderer.invoke('view:payload');
  },
  choose(actionId) {
    return ipcRenderer.invoke('radial:choose', actionId);
  },
  close() {
    return ipcRenderer.invoke('window:close');
  },
  submit(options) {
    return ipcRenderer.invoke('params:submit', options);
  },
  cancel() {
    return ipcRenderer.invoke('convert:cancel');
  },
  show(file) {
    return ipcRenderer.invoke('shell:show', file);
  },
  drop(paths) {
    return ipcRenderer.invoke('drop:paths', paths);
  },
  saveSettings(patch) {
    return ipcRenderer.invoke('settings:set', patch);
  },
  fileData(token) {
    return ipcRenderer.invoke('file:data', token);
  },
  onProgress(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('progress:update', listener);
  },
});
