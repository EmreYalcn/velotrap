import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('idmApi', {
  getAppVersion: () => ipcRenderer.invoke('idm:get-app-version'),
  getDownloads: () => ipcRenderer.invoke('idm:get-downloads'),
  probeUrl: (url: string, headers?: Record<string, string>) =>
    ipcRenderer.invoke('idm:probe-url', url, headers),
  addDownload: (options: any) => ipcRenderer.invoke('idm:add-download', options),
  startDownload: (id: string) => ipcRenderer.invoke('idm:start-download', id),
  pauseDownload: (id: string) => ipcRenderer.invoke('idm:pause-download', id),
  pauseAll: () => ipcRenderer.invoke('idm:pause-all'),
  resumeAll: () => ipcRenderer.invoke('idm:resume-all'),
  deleteDownload: (id: string, deleteFile: boolean) =>
    ipcRenderer.invoke('idm:delete-download', id, deleteFile),
  openFileLocation: (savePath: string) =>
    ipcRenderer.invoke('idm:open-file-location', savePath),
  openFile: (savePath: string) => ipcRenderer.invoke('idm:open-file', savePath),
  selectDirectory: () => ipcRenderer.invoke('idm:select-directory'),
  selectMediaFile: () => ipcRenderer.invoke('idm:select-media-file'),
  convertMedia: (
    inputPath: string,
    targetFormat: 'mp3-320' | 'mp3-192' | 'm4a' | 'wav' | 'mp4-h264'
  ) => ipcRenderer.invoke('idm:convert-media', inputPath, targetFormat),
  getSettings: () => ipcRenderer.invoke('idm:get-settings'),
  updateSettings: (partial: any) => ipcRenderer.invoke('idm:update-settings', partial),
  analyzeVideo: (url: string, headers?: Record<string, string>) =>
    ipcRenderer.invoke('idm:analyze-video', url, headers),
  getEngineStatus: () => ipcRenderer.invoke('idm:get-engine-status'),
  installYtDlp: () => ipcRenderer.invoke('idm:install-ytdlp'),
  getExtensionStatus: () => ipcRenderer.invoke('idm:get-extension-status'),
  installExtensionHelper: () => ipcRenderer.invoke('idm:install-extension-helper'),
  openExtensionFolder: () => ipcRenderer.invoke('idm:open-extension-folder'),
  getSniffedItems: () => ipcRenderer.invoke('idm:get-sniffed-items'),
  clearSniffedItems: () => ipcRenderer.invoke('idm:clear-sniffed-items'),
  openSnifferBrowser: (url: string) => ipcRenderer.invoke('idm:open-sniffer-browser', url),

  onDownloadsUpdated: (cb: (items: any[]) => void) => {
    const listener = (_event: any, items: any[]) => cb(items);
    ipcRenderer.on('idm:downloads-updated', listener);
    return () => ipcRenderer.removeListener('idm:downloads-updated', listener);
  },
  onDownloadCompleted: (cb: (item: any) => void) => {
    const listener = (_event: any, item: any) => cb(item);
    ipcRenderer.on('idm:download-completed', listener);
    return () => ipcRenderer.removeListener('idm:download-completed', listener);
  },
  onSnifferUpdated: (cb: (items: any[]) => void) => {
    const listener = (_event: any, items: any[]) => cb(items);
    ipcRenderer.on('idm:sniffer-updated', listener);
    return () => ipcRenderer.removeListener('idm:sniffer-updated', listener);
  },
  onExtensionStatusUpdated: (cb: (status: any) => void) => {
    const listener = (_event: any, status: any) => cb(status);
    ipcRenderer.on('idm:extension-status', listener);
    return () => ipcRenderer.removeListener('idm:extension-status', listener);
  },
  onYtDlpInstallProgress: (cb: (data: { pct: number; statusText: string }) => void) => {
    const listener = (_event: any, data: { pct: number; statusText: string }) => cb(data);
    ipcRenderer.on('idm:ytdlp-progress', listener);
    return () => ipcRenderer.removeListener('idm:ytdlp-progress', listener);
  },
  onConvertProgress: (cb: (data: { inputPath: string; pct: number }) => void) => {
    const listener = (_event: any, data: { inputPath: string; pct: number }) => cb(data);
    ipcRenderer.on('idm:convert-progress', listener);
    return () => ipcRenderer.removeListener('idm:convert-progress', listener);
  },
});
