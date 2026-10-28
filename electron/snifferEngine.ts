import { BrowserWindow, session } from 'electron';
import { EventEmitter } from 'events';
import * as path from 'path';
import { URL } from 'url';
import { SniffedMediaItem } from './types';

export class SnifferEngine extends EventEmitter {
  private sniffedItems: Map<string, SniffedMediaItem> = new Map();
  private requestHeadersCache: Map<number, Record<string, string>> = new Map();
  private snifferWindow: BrowserWindow | null = null;
  private isHooked = false;

  constructor() {
    super();
  }

  public getSniffedItems(): SniffedMediaItem[] {
    return Array.from(this.sniffedItems.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public clearSniffedItems(): void {
    this.sniffedItems.clear();
    this.emit('sniffer-updated', []);
  }

  public attachSessionInterceptors(): void {
    if (this.isHooked) return;
    this.isHooked = true;

    const snifferSession = session.fromPartition('persist:idm-sniffer');

    snifferSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers: Record<string, string> = {};
      if (details.requestHeaders) {
        for (const [k, v] of Object.entries(details.requestHeaders)) {
          headers[k] = Array.isArray(v) ? (v as string[]).join('; ') : String(v);
        }
      }
      this.requestHeadersCache.set(details.id, headers);
      callback({ requestHeaders: details.requestHeaders });
    });

    snifferSession.webRequest.onHeadersReceived((details, callback) => {
      try {
        this.inspectNetworkResponse(details);
      } catch {
        // Ignore inspection errors
      }
      callback({ responseHeaders: details.responseHeaders });
    });
  }

  private inspectNetworkResponse(details: Electron.OnHeadersReceivedListenerDetails): void {
    const reqUrl = details.url;
    if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://')) return;

    const parsed = new URL(reqUrl);
    const pathnameLower = parsed.pathname.toLowerCase();

    // Skip tiny HLS .ts or .m4s segments if we already capture the .m3u8 master/media playlist
    if (pathnameLower.endsWith('.ts') || pathnameLower.endsWith('.m4s')) {
      return;
    }

    const resHeaders = details.responseHeaders || {};
    const getHeader = (name: string): string => {
      const key = Object.keys(resHeaders).find((k) => k.toLowerCase() === name.toLowerCase());
      const val = key ? resHeaders[key] : undefined;
      return Array.isArray(val) ? val[0] || '' : val || '';
    };

    const contentType = getHeader('content-type').toLowerCase();
    const contentLength = parseInt(getHeader('content-length') || '0', 10);

    const isM3u8 =
      pathnameLower.endsWith('.m3u8') ||
      reqUrl.toLowerCase().includes('.m3u8?') ||
      contentType.includes('mpegurl') ||
      contentType.includes('vnd.apple.mpegurl');

    const isMediaExt = /\.(mp4|webm|mkv|mov|flv|avi|mp3|m4a|wav|aac|ogg)$/i.test(pathnameLower);
    const isMediaMime =
      contentType.startsWith('video/') ||
      contentType.startsWith('audio/') ||
      contentType.includes('dash+xml');

    // Ignore very small tracking/preview responses under 150 KB unless it's an m3u8 playlist
    if (!isM3u8 && !isMediaExt && !isMediaMime) return;
    if (!isM3u8 && contentLength > 0 && contentLength < 150 * 1024) return;

    // Deduplicate by URL without volatile range parameters
    const cleanKey = reqUrl.replace(/[&?]range=[^&]+/gi, '');
    if (this.sniffedItems.has(cleanKey)) return;

    const capturedHeaders = this.requestHeadersCache.get(details.id) || {};
    const pageTitle = this.snifferWindow && !this.snifferWindow.isDestroyed()
      ? this.snifferWindow.getTitle() || parsed.hostname
      : parsed.hostname;
    const pageUrl = this.snifferWindow && !this.snifferWindow.isDestroyed()
      ? this.snifferWindow.webContents.getURL() || reqUrl
      : reqUrl;

    let ext = path.extname(parsed.pathname).replace('.', '').toLowerCase();
    if (isM3u8) ext = 'm3u8';
    else if (!ext) {
      if (contentType.includes('webm')) ext = 'webm';
      else if (contentType.startsWith('audio/')) ext = 'mp3';
      else ext = 'mp4';
    }

    const item: SniffedMediaItem = {
      id: `sniff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      url: reqUrl,
      pageUrl,
      pageTitle,
      mimeType: contentType || (isM3u8 ? 'application/x-mpegURL' : 'video/mp4'),
      ext,
      sizeBytes: isM3u8 ? 0 : contentLength,
      resolution: isM3u8 ? 'HLS Canlı/Akış (.m3u8)' : 'Doğrudan Medya Akışı',
      timestamp: new Date().toISOString(),
      headers: capturedHeaders,
    };

    this.sniffedItems.set(cleanKey, item);
    this.emit('sniffer-updated', this.getSniffedItems());
  }

  /**
   * Opens or navigates the built-in IDM Site Video Sniffer Browser Window
   */
  public openSnifferBrowser(targetUrl: string): void {
    this.attachSessionInterceptors();

    const normalizedUrl =
      targetUrl.startsWith('http://') || targetUrl.startsWith('https://')
        ? targetUrl
        : `https://${targetUrl}`;

    if (this.snifferWindow && !this.snifferWindow.isDestroyed()) {
      this.snifferWindow.loadURL(normalizedUrl);
      this.snifferWindow.focus();
      return;
    }

    this.snifferWindow = new BrowserWindow({
      width: 1120,
      height: 760,
      title: 'Velotrap — Canlı Site Video Yakalayıcı (Videoyu Oynatın, Otomatik Yakalanır)',
      backgroundColor: '#0f172a',
      webPreferences: {
        partition: 'persist:idm-sniffer',
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    this.snifferWindow.loadURL(normalizedUrl);
    this.snifferWindow.on('closed', () => {
      this.snifferWindow = null;
    });
  }
}
