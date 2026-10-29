import { app, BrowserWindow, ipcMain, shell, dialog, clipboard, Menu } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as http from 'http';
import { spawn } from 'child_process';
import { DownloadEngine } from './downloadEngine';
import { VideoEngine } from './videoEngine';
import { SnifferEngine } from './snifferEngine';
import { EngineSettings } from './types';

app.setName('Velotrap');

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}
let downloadEngine: DownloadEngine;
let videoEngine: VideoEngine;
let snifferEngine: SnifferEngine;
let companionServer: http.Server | null = null;
let lastExtensionHeartbeat: number = 0;
let extensionDetails: { version?: string; extensionId?: string; name?: string } | null = null;

function getExtensionPath(): string {
  const bundledDevPath = path.resolve(__dirname, '../browser-extension');
  if (fs.existsSync(bundledDevPath)) return bundledDevPath;

  const resPath = path.join(process.resourcesPath || '', 'app', 'browser-extension');
  if (fs.existsSync(resPath)) return resPath;

  const appPath = path.join(app.getAppPath(), 'browser-extension');
  if (fs.existsSync(appPath)) return appPath;

  return bundledDevPath;
}

function checkExtensionStatus(): {
  isInstalled: boolean;
  version: string | null;
  lastSeenAt: number | null;
  extensionPath: string;
} {
  const extPath = getExtensionPath();
  const now = Date.now();

  // 1. If extension sent a heartbeat recently (within last 35 seconds)
  if (lastExtensionHeartbeat > 0 && now - lastExtensionHeartbeat < 35000) {
    return {
      isInstalled: true,
      version: extensionDetails?.version || getAppVersion(),
      lastSeenAt: lastExtensionHeartbeat,
      extensionPath: extPath,
    };
  }

  // 2. Check Google Chrome Preferences on macOS
  try {
    const chromeDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    if (fs.existsSync(chromeDir)) {
      const profiles = ['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4'];
      for (const prof of profiles) {
        const prefPath = path.join(chromeDir, prof, 'Preferences');
        if (fs.existsSync(prefPath)) {
          const content = fs.readFileSync(prefPath, 'utf8');
          if (content.includes('browser-extension') || content.includes('Velotrap')) {
            return {
              isInstalled: true,
              version: extensionDetails?.version || getAppVersion(),
              lastSeenAt: lastExtensionHeartbeat || null,
              extensionPath: extPath,
            };
          }
        }
      }
    }
  } catch {}

  return {
    isInstalled: false,
    version: null,
    lastSeenAt: null,
    extensionPath: extPath,
  };
}

function getAppVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    return pkg.version || '3.1.0';
  } catch {
    return '3.1.0';
  }
}

function createDefaultSettings(stateDir: string): EngineSettings {
  const settingsFile = path.join(stateDir, 'settings.json');
  const defaults: EngineSettings = {
    downloadDir: path.join(os.homedir(), 'Downloads', 'Velotrap'),
    maxConnectionsPerDownload: 16,
    maxConcurrentDownloads: 5,
    speedLimitKbps: 0,
    autoStartDownloads: true,
    clipboardMonitor: true,
    ytDlpPath: '',
    ffmpegPath: '/opt/homebrew/bin/ffmpeg',
    language: 'tr',
    youtubeAntiBot: true,
    youtubeBrowserCookies: 'none',
  };

  try {
    if (fs.existsSync(settingsFile)) {
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      return { ...defaults, ...saved };
    }
  } catch {
    // Use defaults
  }
  return defaults;
}

function saveSettingsToDisk(stateDir: string, settings: EngineSettings): void {
  try {
    fs.writeFileSync(
      path.join(stateDir, 'settings.json'),
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
  } catch (err) {
    console.error('Failed to persist settings:', err);
  }
}

const analysisCache = new Map<string, { timestamp: number; data: any }>();

function startCompanionHttpBridge(): void {
  companionServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Access-Control-Request-Private-Network'
    );
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || '/';

    if (req.method === 'GET' && url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          app: 'Velotrap',
          version: getAppVersion(),
          extension: checkExtensionStatus(),
          engine: videoEngine.getEngineStatus(),
          settings: downloadEngine.getSettings(),
          language: downloadEngine.getSettings().language || 'tr',
          downloads: downloadEngine.getAllItems(),
        })
      );
      return;
    }

    if (req.method === 'POST' && url === '/api/extension-heartbeat') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const wasInstalled = lastExtensionHeartbeat > 0 && Date.now() - lastExtensionHeartbeat < 35000;
          lastExtensionHeartbeat = Date.now();
          extensionDetails = {
            version: parsed.version,
            extensionId: parsed.extensionId,
            name: parsed.name,
          };
          if (!wasInstalled && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('idm:extension-status', checkExtensionStatus());
          }
        } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            app: 'Velotrap',
            version: getAppVersion(),
            language: downloadEngine.getSettings().language || 'tr',
            settings: downloadEngine.getSettings(),
          })
        );
      });
      return;
    }

    if (req.method === 'POST' && url === '/api/focus') {
      try {
        showMainWindow();
        app.focus({ steal: true });
        // Force bring Electron to the foreground on macOS
        if (process.platform === 'darwin') {
          spawn('/usr/bin/osascript', [
            '-e',
            'tell application "System Events" to set frontmost of first process whose name contains "Electron" or name contains "Velotrap" to true',
          ]);
        }
      } catch (focusErr) {
        console.error('[Velotrap] Error focusing window:', focusErr);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && (url === '/api/add' || url === '/api/analyze')) {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');

          if (url === '/api/analyze') {
            const targetUrl = String(payload.url || '').trim();
            const videoSrc = String(payload.videoSrc || '').trim();
            const EXCLUDE_STREAM_REGEX = /(?:sf16-website-login|tiktok_web_login_static|playback1\.mp4|\.json(?:\?|$)|static\/(?:js|css)\/)/i;
            const sniffedStreams: Array<{
              url: string;
              ext?: string;
              sizeBytes?: number;
              mimeType?: string;
              headers?: Record<string, string>;
            }> = (Array.isArray(payload.sniffedStreams) ? payload.sniffedStreams : []).filter(
              (s: any) => s && s.url && !EXCLUDE_STREAM_REGEX.test(s.url)
            );
            const reqHeaders: Record<string, string> = payload.headers || {};

            const cacheKey = `${targetUrl}|${videoSrc}|${sniffedStreams.map((s) => s.url).join(',')}`;
            const cached = analysisCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, analysis: cached.data }));
              return;
            }

            let analysis: any = null;
            const isMajorPlatform =
              /youtube\.com|youtu\.be|x\.com|twitter\.com|tiktok\.com|instagram\.com|reddit\.com|vimeo\.com|twitch\.tv|facebook\.com|dailymotion\.com|vk\.com|ok\.ru|soundcloud\.com/i.test(
                targetUrl
              );

            // Fast-path: If we are on a custom streaming site and Chrome already captured .m3u8/.mp4 streams,
            // analyze the captured streams immediately (<40ms) without waiting on yt-dlp to time out!
            if (!isMajorPlatform && sniffedStreams.length > 0) {
              for (const stream of sniffedStreams) {
                try {
                  analysis = await videoEngine.analyzeUrl(
                    stream.url,
                    stream.headers || reqHeaders
                  );
                  if (analysis && analysis.formats && analysis.formats.length > 0) {
                    analysis.title = payload.title || analysis.title || 'Web Video';
                    break;
                  }
                } catch {
                  // try next
                }
              }
            }

            // 1. Try analyzing the main target URL (yt-dlp / HLS / direct / HTML)
            if (!analysis && targetUrl) {
              try {
                analysis = await videoEngine.analyzeUrl(targetUrl, reqHeaders);
              } catch {
                analysis = null;
              }
            }

            // 2. If direct <video src> is an HTTP URL and main analysis had no formats, analyze videoSrc
            if (
              (!analysis || !analysis.formats || analysis.formats.length === 0) &&
              videoSrc &&
              videoSrc.startsWith('http')
            ) {
              try {
                analysis = await videoEngine.analyzeUrl(videoSrc, reqHeaders);
              } catch {
                // Continue to sniffed streams fallback
              }
            }

            // 3. Merge any Chrome webRequest sniffed streams (.m3u8 / .mp4 / .webm) from the tab
            if (sniffedStreams.length > 0) {
              if (!analysis) {
                analysis = {
                  url: sniffedStreams[0].url,
                  title: payload.title || 'Web Video',
                  extractor: 'hls-native',
                  formats: [],
                  headers: reqHeaders,
                };
              }

              const existingUrls = new Set(
                (analysis.formats || []).map((f: any) => f.streamUrl).filter(Boolean)
              );

              for (const stream of sniffedStreams) {
                if (!stream.url || existingUrls.has(stream.url)) continue;
                existingUrls.add(stream.url);

                const isM3u8 =
                  stream.ext === 'm3u8' ||
                  stream.url.toLowerCase().includes('.m3u8') ||
                  (stream.mimeType || '').toLowerCase().includes('mpegurl');

                if (isM3u8) {
                  try {
                    const hlsRes = await videoEngine.analyzeUrl(
                      stream.url,
                      stream.headers || reqHeaders
                    );
                    for (const fmt of hlsRes.formats) {
                      analysis.formats.push(fmt);
                    }
                    continue;
                  } catch {
                    // Fallback to single HLS option
                  }
                }

                const ext = stream.ext || 'mp4';
                analysis.formats.push({
                  formatId: `sniff_${analysis.formats.length + 1}`,
                  ext: isM3u8 ? 'mp4' : ext,
                  resolution: isM3u8
                    ? 'En Yüksek Kalite (HLS Video Akışı)'
                    : `En Yüksek Kalite (${ext.toUpperCase()} Video)`,
                  filesize: stream.sizeBytes || undefined,
                  note: isM3u8
                    ? 'Ağdan Yakalanan HLS (.m3u8) • FFmpeg MP4'
                    : 'Ağdan Yakalanan Akış • 16x Çoklu Parça',
                  isAudioOnly: false,
                  needsMerge: isM3u8,
                  streamUrl: stream.url,
                  protocol: isM3u8 ? 'm3u8' : 'https',
                });
              }
            }

            // Always ensure Audio / MP3 conversion options exist in analysis.formats
            if (analysis && Array.isArray(analysis.formats)) {
              const hasAudioOpt = analysis.formats.some((f: any) => f.isAudioOnly);
              if (!hasAudioOpt) {
                analysis.formats.push(
                  {
                    formatId: 'audio:mp3:320',
                    ext: 'mp3',
                    resolution: 'MP3 Ses (320 kbps Stüdyo Kalitesi)',
                    note: 'Videodan MP3 Sese Dönüştür (FFmpeg 320k)',
                    isAudioOnly: true,
                    needsMerge: true,
                    protocol: 'yt-dlp',
                  },
                  {
                    formatId: 'audio:mp3:192',
                    ext: 'mp3',
                    resolution: 'MP3 Ses (192 kbps Standart)',
                    note: 'Videodan MP3 Sese Dönüştür (192k)',
                    isAudioOnly: true,
                    needsMerge: true,
                    protocol: 'yt-dlp',
                  },
                  {
                    formatId: 'audio:m4a:256',
                    ext: 'm4a',
                    resolution: 'M4A / AAC Ses (256 kbps)',
                    note: 'AAC Ses Çıkarıcı',
                    isAudioOnly: true,
                    needsMerge: true,
                    protocol: 'yt-dlp',
                  },
                  {
                    formatId: 'audio:wav:0',
                    ext: 'wav',
                    resolution: 'WAV Ses (Kayıpsız PCM)',
                    note: 'Kayıpsız WAV Dönüştürücü',
                    isAudioOnly: true,
                    needsMerge: true,
                    protocol: 'yt-dlp',
                  }
                );
              }
            }

            if (!analysis || !analysis.formats || analysis.formats.length === 0) {
              throw new Error('Bu video için indirilebilir akış bulunamadı.');
            }

            if (payload.title && (!analysis.title || analysis.title === 'video')) {
              analysis.title = payload.title;
            }

            analysisCache.set(cacheKey, { timestamp: Date.now(), data: analysis });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, analysis }));
            return;
          }

          const EXCLUDE_STREAM_REGEX = /(?:sf16-website-login|tiktok_web_login_static|playback1\.mp4|\.json(?:\?|$)|static\/(?:js|css)\/|\.(?:jpe?g|png|gif|webp|svg|ico|woff2?)(?:\?|$|#)|\/tos-[^/]+-(?:avt|image|photomode|cropcenter))/i;
          let targetUrl = payload.url;
          const cleanFallbacks = (Array.isArray(payload.fallbackStreamUrls) ? payload.fallbackStreamUrls : []).filter(
            (u: any) => typeof u === 'string' && !EXCLUDE_STREAM_REGEX.test(u)
          );
          if (EXCLUDE_STREAM_REGEX.test(targetUrl)) {
            if (cleanFallbacks.length > 0) {
              targetUrl = cleanFallbacks[0];
            } else if (payload.pageUrl && !EXCLUDE_STREAM_REGEX.test(payload.pageUrl)) {
              targetUrl = payload.pageUrl;
            }
          }

          if (/tiktok\.com/i.test(targetUrl) && !/\/video\/\d+/.test(targetUrl)) {
            const vidMatch =
              (payload.pageUrl && payload.pageUrl.match(/\/video\/(\d{15,22})/)) ||
              cleanFallbacks.join(' ').match(/\/video\/(\d{15,22})/);
            if (vidMatch) {
              targetUrl = `https://www.tiktok.com/@tiktok/video/${vidMatch[1]}`;
            }
          }

          const item = await downloadEngine.addDownload({
            url: targetUrl,
            fileName: payload.fileName,
            saveDir: payload.saveDir,
            connectionsCount:
              payload.connectionsCount ||
              downloadEngine.getSettings().maxConnectionsPerDownload ||
              16,
            headers: payload.headers,
            pageUrl: payload.pageUrl,
            fallbackStreamUrls: cleanFallbacks,
            sourceType: payload.sourceType || 'direct',
            videoFormatId: payload.videoFormatId,
            videoResolution: payload.videoResolution,
            totalBytes: payload.totalBytes,
            description: payload.description,
            autoStart: payload.autoStart ?? true,
            clipRange: payload.clipRange,
          });

          if (payload.focusWindow && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, item }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err?.message || 'Invalid request' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
  });

  companionServer.on('error', (err: any) => {
    console.error('[Velotrap Bridge] Server error:', err?.message || err);
    if (err && err.code === 'EADDRINUSE') {
      setTimeout(() => {
        try {
          companionServer?.close();
          companionServer?.listen(46890, '127.0.0.1');
        } catch {
          // ignore
        }
      }, 800);
    }
  });

  companionServer.listen(46890, '127.0.0.1', () => {
    console.log('[Velotrap Bridge] Listening on http://127.0.0.1:46890');
  });
}


interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const windowStateFilePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState(): WindowBounds {
  const defaultBounds: WindowBounds = {
    width: 1320,
    height: 840,
  };
  try {
    if (fs.existsSync(windowStateFilePath)) {
      const data = JSON.parse(fs.readFileSync(windowStateFilePath, 'utf8'));
      return { ...defaultBounds, ...data };
    }
  } catch {}
  return defaultBounds;
}

function saveWindowState(win: BrowserWindow): void {
  try {
    if (!win || win.isDestroyed()) return;
    const isMax = win.isMaximized();
    if (!isMax) {
      const bounds = win.getBounds();
      fs.writeFileSync(windowStateFilePath, JSON.stringify({ ...bounds, isMaximized: false }), 'utf8');
    } else {
      fs.writeFileSync(windowStateFilePath, JSON.stringify({ isMaximized: true }), 'utf8');
    }
  } catch {}
}

function createWindow(): void {
  const savedState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: savedState.width || 1320,
    height: savedState.height || 840,
    x: savedState.x,
    y: savedState.y,
    minWidth: 1024,
    minHeight: 680,
    title: 'Velotrap — Ultra Hızlı Medya & İndirme Yöneticisi',
    backgroundColor: '#010206',
    icon: path.join(__dirname, '../public/logo.png'),
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (savedState.isMaximized) {
    mainWindow.maximize();
  }

  // Save bounds on resize and move (debounced)
  let saveTimer: NodeJS.Timeout | null = null;
  const triggerSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        saveWindowState(mainWindow);
      }
    }, 400);
  };

  mainWindow.on('resize', triggerSave);
  mainWindow.on('move', triggerSave);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting && process.platform === 'darwin') {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, '../public/logo.png');
    if (fs.existsSync(iconPath)) {
      try {
        app.dock.setIcon(iconPath);
      } catch {}
    }
    try {
      const dockMenu = Menu.buildFromTemplate([
        {
          label: 'Velotrap Penceresini Göster',
          click() {
            showMainWindow();
          },
        },
      ]);
      app.dock.setMenu(dockMenu);
    } catch {}
  }

  const stateDir = path.join(app.getPath('userData'), 'idm-pro-state');
  const initialSettings = createDefaultSettings(stateDir);

  downloadEngine = new DownloadEngine(stateDir, initialSettings);
  videoEngine = new VideoEngine(downloadEngine, stateDir);
  snifferEngine = new SnifferEngine();

  downloadEngine.on('downloads-updated', (items) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('idm:downloads-updated', items);
    }
  });

  downloadEngine.on('download-completed', (item) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('idm:download-completed', item);
    }
  });

  snifferEngine.on('sniffer-updated', (items) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('idm:sniffer-updated', items);
    }
  });

  // Register IPC Handlers
  ipcMain.handle('idm:get-downloads', () => downloadEngine.getAllItems());
  ipcMain.handle('idm:get-app-version', () => getAppVersion());
  ipcMain.handle('idm:get-extension-status', () => checkExtensionStatus());

  ipcMain.handle('idm:install-extension-helper', async () => {
    const extPath = getExtensionPath();
    try {
      clipboard.writeText(extPath);
    } catch {}

    if (process.platform === 'darwin') {
      spawn('/usr/bin/open', ['-a', 'Google Chrome', 'chrome://extensions']);
      shell.openPath(extPath);
    } else {
      shell.openExternal('chrome://extensions');
      shell.openPath(extPath);
    }

    return { ok: true, path: extPath };
  });

  ipcMain.handle('idm:open-extension-folder', () => {
    const extPath = getExtensionPath();
    shell.openPath(extPath);
    return { ok: true, path: extPath };
  });

  ipcMain.handle('idm:probe-url', async (_e, url: string, headers?: Record<string, string>) => {
    return downloadEngine.probeUrl(url, headers);
  });

  ipcMain.handle('idm:add-download', async (_e, options: any) => {
    return downloadEngine.addDownload(options);
  });

  ipcMain.handle('idm:start-download', async (_e, id: string) => {
    await downloadEngine.startDownload(id);
    return downloadEngine.getAllItems();
  });

  ipcMain.handle('idm:pause-download', async (_e, id: string) => {
    await downloadEngine.pauseDownload(id);
    return downloadEngine.getAllItems();
  });

  ipcMain.handle('idm:pause-all', async () => {
    await downloadEngine.pauseAll();
    return downloadEngine.getAllItems();
  });

  ipcMain.handle('idm:resume-all', async () => {
    await downloadEngine.resumeAll();
    return downloadEngine.getAllItems();
  });

  ipcMain.handle('idm:delete-download', async (_e, id: string, deleteFile: boolean) => {
    await downloadEngine.deleteDownload(id, deleteFile);
    return downloadEngine.getAllItems();
  });

  ipcMain.handle('idm:open-file-location', async (_e, savePath: string) => {
    if (fs.existsSync(savePath)) {
      shell.showItemInFolder(savePath);
      return true;
    }
    const dir = path.dirname(savePath);
    if (fs.existsSync(dir)) {
      await shell.openPath(dir);
      return true;
    }
    return false;
  });

  ipcMain.handle('idm:open-file', async (_e, savePath: string) => {
    if (fs.existsSync(savePath)) {
      await shell.openPath(savePath);
      return true;
    }
    return false;
  });

  ipcMain.handle('idm:select-directory', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('idm:select-media-file', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Medya Dosyaları',
          extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'ts', 'm4a', 'mp3', 'wav'],
        },
      ],
    });
    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths[0];
    }
    return null;
  });

  ipcMain.handle(
    'idm:convert-media',
    async (
      _e,
      inputPath: string,
      targetFormat: 'mp3-320' | 'mp3-192' | 'm4a' | 'wav' | 'mp4-h264'
    ) => {
      return videoEngine.convertLocalMedia(inputPath, targetFormat, (pct) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('idm:convert-progress', { inputPath, pct });
        }
      });
    }
  );

  ipcMain.handle('idm:get-settings', () => downloadEngine.getSettings());

  ipcMain.handle('idm:update-settings', (_e, partial: Partial<EngineSettings>) => {
    const updated = downloadEngine.updateSettings(partial);
    saveSettingsToDisk(stateDir, updated);
    return updated;
  });

  ipcMain.handle('idm:analyze-video', async (_e, url: string, headers?: Record<string, string>) => {
    return videoEngine.analyzeUrl(url, headers);
  });

  ipcMain.handle('idm:get-engine-status', () => videoEngine.getEngineStatus());

  ipcMain.handle('idm:install-ytdlp', async () => {
    const binPath = await videoEngine.installYtDlpBinary((pct, statusText) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('idm:ytdlp-progress', { pct, statusText });
      }
    });
    saveSettingsToDisk(stateDir, downloadEngine.getSettings());
    return { ok: true, binPath, status: videoEngine.getEngineStatus() };
  });

  ipcMain.handle('idm:get-sniffed-items', () => snifferEngine.getSniffedItems());
  ipcMain.handle('idm:clear-sniffed-items', () => snifferEngine.clearSniffedItems());
  ipcMain.handle('idm:open-sniffer-browser', (_e, url: string) => {
    snifferEngine.openSnifferBrowser(url);
    return true;
  });

  startCompanionHttpBridge();
  createWindow();
  setupWorkspaceE2EBridge();

  app.on('activate', () => {
    showMainWindow();
  });
});

function setupWorkspaceE2EBridge(): void {
  const workspaceDir = path.resolve(__dirname, '..');
  const liveStateFile = path.join(workspaceDir, '.e2e-live-state.json');
  const cmdFile = path.join(workspaceDir, '.e2e-command.json');
  const resultFile = path.join(workspaceDir, '.e2e-result.json');

  const writeLiveState = () => {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        engine: videoEngine.getEngineStatus(),
        settings: downloadEngine.getSettings(),
        downloads: downloadEngine.getAllItems().map((d) => ({
          id: d.id,
          fileName: d.fileName,
          url: d.url,
          savePath: d.savePath,
          fileExistsOnDisk: fs.existsSync(d.savePath),
          status: d.status,
          category: d.category,
          sourceType: d.sourceType,
          videoFormatId: d.videoFormatId,
          videoResolution: d.videoResolution,
          totalBytes: d.totalBytes,
          downloadedBytes: d.downloadedBytes,
          speedBps: d.speedBps,
          errorMessage: d.errorMessage,
        })),
      };
      fs.writeFileSync(liveStateFile, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  };

  writeLiveState();
  downloadEngine.on('downloads-updated', writeLiveState);
  downloadEngine.on('download-completed', writeLiveState);

  let busy = false;
  setInterval(async () => {
    if (busy || !fs.existsSync(cmdFile)) return;
    busy = true;
    try {
      const raw = fs.readFileSync(cmdFile, 'utf-8');
      fs.unlinkSync(cmdFile);
      const cmd = JSON.parse(raw);
      let resData: any = { ok: true, action: cmd.action, timestamp: new Date().toISOString() };

      if (cmd.action === 'reload-ui') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
          mainWindow.show();
        }
      } else if (cmd.action === 'relaunch') {
        fs.writeFileSync(resultFile, JSON.stringify(resData, null, 2), 'utf-8');
        app.relaunch();
        app.exit(0);
        return;
      } else if (cmd.action === 'retry-all-errors') {
        const failed = downloadEngine.getAllItems().filter((i) => i.status === 'error');
        resData.retriedIds = failed.map((i) => i.id);
        for (const item of failed) {
          downloadEngine.startDownload(item.id).catch(() => {});
        }
      } else if (cmd.action === 'retry-id' && cmd.id) {
        downloadEngine.startDownload(cmd.id).catch(() => {});
      } else if (cmd.action === 'delete-id' && cmd.id) {
        await downloadEngine.deleteDownload(cmd.id, Boolean(cmd.deleteDisk));
      } else if (cmd.action === 'add-download' && cmd.options) {
        resData.item = await downloadEngine.addDownload(cmd.options);
      } else if (cmd.action === 'analyze' && cmd.url) {
        resData.analysis = await videoEngine.analyzeUrl(cmd.url, cmd.headers || {});
      } else if (cmd.action === 'exec-osascript' && cmd.script) {
        resData.osascript = await new Promise((resolve) => {
          const proc = spawn('/usr/bin/osascript', ['-e', cmd.script]);
          let out = '';
          let err = '';
          proc.stdout.on('data', (d) => (out += d.toString()));
          proc.stderr.on('data', (d) => (err += d.toString()));
          proc.on('close', (code) => resolve({ code, stdout: out.trim(), stderr: err.trim() }));
        });
      }

      writeLiveState();
      fs.writeFileSync(resultFile, JSON.stringify(resData, null, 2), 'utf-8');
    } catch (err: any) {
      try {
        fs.writeFileSync(
          resultFile,
          JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2),
          'utf-8'
        );
      } catch {}
    } finally {
      busy = false;
    }
  }, 400);
}

app.on('before-quit', () => {
  isQuitting = true;
  if (downloadEngine) downloadEngine.destroy();
  if (companionServer) companionServer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (downloadEngine) downloadEngine.destroy();
    if (companionServer) companionServer.close();
    app.quit();
  }
});
