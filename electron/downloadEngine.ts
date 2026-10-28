import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { EventEmitter } from 'events';
import { spawn, execSync, ChildProcess } from 'child_process';
import {
  DownloadCategory,
  DownloadItem,
  EngineSettings,
  SegmentState,
} from './types';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function detectCategory(fileName: string, mimeType = ''): Exclude<DownloadCategory, 'all'> {
  const ext = path.extname(fileName).toLowerCase().replace('.', '');
  const videoExts = ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'm4v', 'ts', 'm3u8', 'mpg', 'mpeg'];
  const musicExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'];
  const compressedExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'zst'];
  const programExts = ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'apk', 'iso', 'bin', 'sh'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'epub', 'md', 'json', 'xml'];

  if (videoExts.includes(ext) || mimeType.startsWith('video/')) return 'video';
  if (musicExts.includes(ext) || mimeType.startsWith('audio/')) return 'music';
  if (compressedExts.includes(ext) || mimeType.includes('zip') || mimeType.includes('compressed')) return 'compressed';
  if (programExts.includes(ext) || mimeType.includes('apple-diskimage')) return 'programs';
  if (docExts.includes(ext) || mimeType.includes('pdf') || mimeType.startsWith('text/')) return 'documents';
  return 'documents';
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return `download_${Date.now()}.bin`;
  const ext = path.extname(cleaned);
  const base = path.basename(cleaned, ext).slice(0, 90).trim();
  return `${base || 'video'}${ext}`;
}

export interface ProbeResult {
  finalUrl: string;
  fileName: string;
  totalBytes: number;
  resumable: boolean;
  mimeType: string;
  category: Exclude<DownloadCategory, 'all'>;
  isHls: boolean;
}

interface ActiveSegmentController {
  req?: http.ClientRequest;
  aborted: boolean;
}

export class DownloadEngine extends EventEmitter {
  private items: Map<string, DownloadItem> = new Map();
  private activeControllers: Map<string, Map<number, ActiveSegmentController>> = new Map();
  private activeFileHandles: Map<string, fs.promises.FileHandle> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private speedTrackers: Map<string, { lastBytes: number; lastTime: number; samples: number[] }> = new Map();
  private stateFilePath: string;
  private tempRootDir: string;
  private settings: EngineSettings;
  private progressTimer?: NodeJS.Timeout;
  private isDestroyed = false;

  constructor(stateDir: string, initialSettings: EngineSettings) {
    super();
    this.settings = initialSettings;
    this.tempRootDir = path.join(os.tmpdir(), 'velotrap-work');
    try {
      fs.mkdirSync(stateDir, { recursive: true });
    } catch {}
    try {
      fs.mkdirSync(this.settings.downloadDir, { recursive: true });
    } catch {}
    try {
      fs.mkdirSync(this.tempRootDir, { recursive: true });
    } catch {}
    this.stateFilePath = path.join(stateDir, 'downloads-state.json');
    this.loadState();
    this.cleanupLegacyArtifacts();

    this.progressTimer = setInterval(() => {
      this.tickSpeedAndBroadcast();
    }, 300);
  }

  /**
   * Cleans up any leftover *.hls_parts directories from Desktop / Downloads
   */
  private cleanupLegacyArtifacts(): void {
    const dirsToScan = [
      this.settings.downloadDir,
      path.join(os.homedir(), 'Desktop'),
      path.join(os.homedir(), 'Downloads'),
    ];
    for (const dir of dirsToScan) {
      try {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if (entry.endsWith('.hls_parts')) {
            fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
          }
        }
      } catch {
        // Ignore permission errors on non-accessible folders
      }
    }
  }

  private getWorkDir(id: string): string {
    const dir = path.join(this.tempRootDir, id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  public getSettings(): EngineSettings {
    return this.settings;
  }

  public updateSettings(partial: Partial<EngineSettings>): EngineSettings {
    this.settings = { ...this.settings, ...partial };
    if (partial.downloadDir) {
      fs.mkdirSync(this.settings.downloadDir, { recursive: true });
    }
    this.emit('settings-updated', this.settings);
    return this.settings;
  }

  public getAllItems(): DownloadItem[] {
    return Array.from(this.items.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getItem(id: string): DownloadItem | undefined {
    return this.items.get(id);
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed: DownloadItem[] = JSON.parse(raw);
        for (const item of parsed) {
          if (item.status === 'downloading' || item.status === 'connecting' || item.status === 'merging') {
            item.status = 'paused';
            item.speedBps = 0;
            item.etaSeconds = null;
            for (const seg of item.segments) {
              if (seg.status === 'downloading' || seg.status === 'connecting') {
                seg.status = 'paused';
                seg.speedBps = 0;
                seg.info = 'Duraklatıldı';
              }
            }
          }
          this.items.set(item.id, item);
        }
      }
    } catch (err) {
      console.error('Failed to load download state:', err);
    }
  }

  public saveState(): void {
    if (this.isDestroyed) return;
    try {
      const list = this.getAllItems();
      fs.mkdirSync(path.dirname(this.stateFilePath), { recursive: true });
      fs.writeFileSync(this.stateFilePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save download state:', err);
    }
  }

  public destroy(): void {
    this.saveState();
    this.isDestroyed = true;
    if (this.progressTimer) clearInterval(this.progressTimer);
    for (const id of this.items.keys()) {
      this.pauseDownload(id);
    }
  }

  private tickSpeedAndBroadcast(): void {
    let anyActive = false;
    const now = Date.now();

    for (const item of this.items.values()) {
      if (item.status === 'downloading' || item.status === 'connecting' || item.status === 'merging') {
        anyActive = true;
        let tracker = this.speedTrackers.get(item.id);
        if (!tracker) {
          tracker = { lastBytes: item.downloadedBytes, lastTime: now, samples: [] };
          this.speedTrackers.set(item.id, tracker);
        }

        const dt = (now - tracker.lastTime) / 1000;
        if (dt >= 0.3 && item.sourceType === 'direct') {
          const dBytes = Math.max(0, item.downloadedBytes - tracker.lastBytes);
          const instantSpeed = dBytes / dt;
          tracker.samples.push(instantSpeed);
          if (tracker.samples.length > 6) tracker.samples.shift();
          const avgSpeed =
            tracker.samples.reduce((acc, v) => acc + v, 0) / tracker.samples.length;
          item.speedBps = Math.round(avgSpeed);
          tracker.lastBytes = item.downloadedBytes;
          tracker.lastTime = now;

          if (item.totalBytes > item.downloadedBytes && item.speedBps > 0) {
            item.etaSeconds = Math.ceil((item.totalBytes - item.downloadedBytes) / item.speedBps);
          } else {
            item.etaSeconds = null;
          }
        }
      } else {
        item.speedBps = 0;
        item.etaSeconds = null;
      }
    }

    if (anyActive) {
      this.emit('downloads-updated', this.getAllItems());
    }
  }

  /**
   * Probes a URL to determine file size, Range support, MIME type, and file name.
   */
  public async probeUrl(
    targetUrl: string,
    customHeaders: Record<string, string> = {},
    redirectCount = 0
  ): Promise<ProbeResult> {
    if (redirectCount > 8) {
      throw new Error('Çok fazla yönlendirme (Too many redirects)');
    }

    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const requestHeaders: Record<string, string> = {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: '*/*',
      Range: 'bytes=0-0',
      ...customHeaders,
    };

    return new Promise<ProbeResult>((resolve, reject) => {
      const req = client.request(
        parsedUrl,
        {
          method: 'GET',
          headers: requestHeaders,
          timeout: 8000,
          rejectUnauthorized: false,
        },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            this.probeUrl(nextUrl, customHeaders, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          const contentType = (res.headers['content-type'] || '').toLowerCase();
          const contentRange = res.headers['content-range'];
          const acceptRanges = (res.headers['accept-ranges'] || '').toLowerCase();
          const contentLengthHeader = res.headers['content-length'];

          let totalBytes = 0;
          let resumable = false;

          if (status === 206 && contentRange) {
            resumable = true;
            const match = contentRange.match(/\/(\d+)/);
            if (match && match[1]) {
              totalBytes = parseInt(match[1], 10);
            }
          } else if (contentLengthHeader) {
            totalBytes = parseInt(contentLengthHeader, 10) || 0;
            resumable = acceptRanges.includes('bytes');
          }

          let fileName = '';
          const disposition = res.headers['content-disposition'];
          if (disposition) {
            const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
            const stdMatch = disposition.match(/filename="?([^";]+)"?/i);
            if (utf8Match?.[1]) {
              fileName = decodeURIComponent(utf8Match[1]);
            } else if (stdMatch?.[1]) {
              fileName = stdMatch[1];
            }
          }

          if (!fileName) {
            const base = path.basename(parsedUrl.pathname);
            fileName = decodeURIComponent(base || 'downloaded_file');
          }

          if (!path.extname(fileName)) {
            if (contentType.includes('video/mp4')) fileName += '.mp4';
            else if (contentType.includes('video/webm')) fileName += '.webm';
            else if (contentType.includes('audio/mpeg')) fileName += '.mp3';
            else if (contentType.includes('application/pdf')) fileName += '.pdf';
            else if (contentType.includes('application/zip')) fileName += '.zip';
            else if (contentType.includes('mpegurl')) fileName += '.m3u8';
          }

          fileName = sanitizeFileName(fileName);
          const isHls =
            fileName.endsWith('.m3u8') ||
            contentType.includes('mpegurl') ||
            parsedUrl.pathname.toLowerCase().endsWith('.m3u8') ||
            targetUrl.toLowerCase().includes('.m3u8');

          res.destroy();

          const category = detectCategory(fileName, contentType);
          resolve({
            finalUrl: targetUrl,
            fileName,
            totalBytes,
            resumable,
            mimeType: contentType,
            category,
            isHls,
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Bağlantı zaman aşımına uğradı'));
      });
      req.end();
    });
  }

  /**
   * Adds a new download and starts it immediately (without blocking on slow probes when sourceType is yt-dlp/hls).
   */
  public async addDownload(options: {
    url: string;
    fileName?: string;
    saveDir?: string;
    connectionsCount?: number;
    sourceType?: 'direct' | 'yt-dlp' | 'hls';
    videoFormatId?: string;
    videoResolution?: string;
    headers?: Record<string, string>;
    pageUrl?: string;
    fallbackStreamUrls?: string[];
    description?: string;
    totalBytes?: number;
    autoStart?: boolean;
  }): Promise<DownloadItem> {
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const saveDir = options.saveDir || this.settings.downloadDir;
    fs.mkdirSync(saveDir, { recursive: true });

    let finalUrl = options.url;
    let fileName = options.fileName ? sanitizeFileName(options.fileName) : '';
    let totalBytes = options.totalBytes || 0;
    let resumable = true;
    let sourceType = options.sourceType || 'direct';
    const fmtId = options.videoFormatId || '';
    const isAudioRequest = fmtId === 'bestaudio-mp3' || fmtId.startsWith('audio:');

    // If URL is a webpage (not a direct binary file) or has a video/audio format selector, route through universal media engine
    const parsedPath = (() => {
      try {
        return new URL(options.url).pathname.toLowerCase();
      } catch {
        return '';
      }
    })();

    if (parsedPath.endsWith('.m3u8') || options.url.toLowerCase().includes('.m3u8')) {
      sourceType = 'hls';
    } else if (
      sourceType === 'direct' &&
      (isAudioRequest ||
        fmtId === 'best' ||
        fmtId.startsWith('height:') ||
        !/\.(mp4|webm|mkv|mov|avi|flv|mp3|m4a|wav|aac|zip|rar|7z|tar|gz|dmg|pkg|exe|iso|pdf|doc|docx|xls|xlsx)$/i.test(
          parsedPath
        ))
    ) {
      // Check if it's a direct binary file via fast probe; if HTML or streaming site, use yt-dlp universal engine!
      try {
        const probe = await this.probeUrl(options.url, options.headers);
        if (probe.isHls) {
          sourceType = 'hls';
        } else if (probe.mimeType.includes('text/html')) {
          sourceType = 'yt-dlp';
        } else {
          finalUrl = probe.finalUrl;
          if (!fileName) fileName = probe.fileName;
          if (!totalBytes) totalBytes = probe.totalBytes;
          resumable = probe.resumable;
        }
      } catch {
        sourceType = 'yt-dlp';
      }
    }

    if (!fileName) {
      const ext = isAudioRequest
        ? fmtId.split(':')[1] || 'mp3'
        : 'mp4';
      fileName = `video_${Date.now()}.${ext}`;
    }

    // Ensure audio requests have the right audio extension (.mp3 / .m4a / .wav)
    if (isAudioRequest) {
      const targetAudioExt = `.${fmtId.split(':')[1] || 'mp3'}`;
      if (!fileName.toLowerCase().endsWith(targetAudioExt)) {
        fileName = fileName.replace(/\.[^/.]+$/, '') + targetAudioExt;
      }
    } else if (fileName.toLowerCase().endsWith('.m3u8')) {
      fileName = fileName.replace(/\.m3u8$/i, '.mp4');
    }

    fileName = sanitizeFileName(fileName);
    const uniqueFileName = this.getUniqueFileName(saveDir, fileName);
    const savePath = path.join(saveDir, uniqueFileName);
    const category = isAudioRequest ? 'music' : detectCategory(uniqueFileName);
    const connectionsCount =
      options.connectionsCount || this.settings.maxConnectionsPerDownload || 16;

    const item: DownloadItem = {
      id,
      url: finalUrl,
      fileName: uniqueFileName,
      savePath,
      category,
      totalBytes,
      downloadedBytes: 0,
      status: 'queued',
      resumable,
      speedBps: 0,
      etaSeconds: null,
      connectionsCount,
      segments: [],
      createdAt: new Date().toISOString(),
      sourceType,
      videoFormatId: options.videoFormatId,
      videoResolution: options.videoResolution,
      headers: options.headers,
      pageUrl: options.pageUrl,
      fallbackStreamUrls: options.fallbackStreamUrls,
      description: options.description,
    };

    this.items.set(id, item);
    this.saveState();
    this.emit('downloads-updated', this.getAllItems());

    if (options.autoStart ?? this.settings.autoStartDownloads) {
      this.startDownload(id).catch((err) => {
        console.error('Error starting download:', err);
      });
    }

    return item;
  }

  private getUniqueFileName(dir: string, fileName: string): string {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    let candidate = fileName;
    let counter = 1;
    while (fs.existsSync(path.join(dir, candidate))) {
      candidate = `${base} (${counter})${ext}`;
      counter++;
    }
    return candidate;
  }

  public async startDownload(id: string): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;
    if (item.status === 'downloading' || item.status === 'connecting') return;

    item.errorMessage = undefined;
    item.status = 'connecting';
    this.emit('downloads-updated', this.getAllItems());

    if (item.sourceType === 'yt-dlp' || item.sourceType === 'hls') {
      await this.runUniversalMediaDownload(item);
      return;
    }

    await this.runDirectMultiSegmentDownload(item);
  }

  /**
   * 3-Stage Universal Video & MP3 Download Engine (Works on YouTube, X, TikTok, Instagram, HLS .m3u8, and arbitrary websites)
   * All temporary files are strictly kept in /tmp/idm-pro-work/<id>/ — NEVER on the user's Desktop/Downloads!
   */
  private async runUniversalMediaDownload(item: DownloadItem): Promise<void> {
    const workDir = this.getWorkDir(item.id);
    const numConns = item.connectionsCount || 16;
    item.segments = Array.from({ length: numConns }, (_, i) => ({
      id: i + 1,
      startByte: 0,
      endByte: 100,
      downloadedBytes: 0,
      status: 'downloading',
      speedBps: 0,
      info: `Paralel Akış Kanalı #${i + 1} Bağlanıyor...`,
    }));
    item.status = 'downloading';
    this.emit('downloads-updated', this.getAllItems());

    const fmtId = item.videoFormatId || 'best';
    const isAudioRequest = fmtId === 'bestaudio-mp3' || fmtId.startsWith('audio:');

    // Build candidate URLs to try in order:
    // 1. Primary URL
    // 2. Any fallback stream URLs (.m3u8 / .mp4) captured by the Chrome Extension in the tab/iframe
    const candidateUrls: string[] = [item.url];
    if (Array.isArray(item.fallbackStreamUrls)) {
      for (const u of item.fallbackStreamUrls) {
        if (!u || candidateUrls.includes(u)) continue;
        if (u.includes('googlevideo.com/videoplayback') || /\.(ts|m4s)(\?|$)/i.test(u)) continue;
        candidateUrls.push(u);
      }
    }

    let downloadedTempFile: string | null = null;
    let lastError = '';

    // STAGE 1 & 2: Try yt-dlp on primary URL, then on fallback stream URLs (or HTML scraped streams)
    const ytDlpBin = this.resolveYtDlpBinary();
    if (ytDlpBin) {
      for (let i = 0; i < candidateUrls.length; i++) {
        if ((item.status as string) === 'paused') return;
        const targetUrl = candidateUrls[i];
        try {
          downloadedTempFile = await this.executeYtDlpToWorkDir(
            ytDlpBin,
            item,
            targetUrl,
            workDir,
            isAudioRequest,
            false
          );
          if (downloadedTempFile && fs.existsSync(downloadedTempFile)) {
            break;
          }
        } catch (err: any) {
          lastError = err?.message || 'yt-dlp hatası';

          if (
            !/youtube\.com|youtu\.be|x\.com|twitter\.com/i.test(targetUrl) &&
            item.headers &&
            Object.keys(item.headers).length > 0
          ) {
            try {
              downloadedTempFile = await this.executeYtDlpToWorkDir(
                ytDlpBin,
                item,
                targetUrl,
                workDir,
                isAudioRequest,
                true
              );
              if (downloadedTempFile && fs.existsSync(downloadedTempFile)) {
                break;
              }
            } catch (err2: any) {
              lastError = err2?.message || lastError;
            }
          }

          if (
            i === 0 &&
            !/youtube\.com|youtu\.be|x\.com|twitter\.com|tiktok\.com|instagram\.com/i.test(
              targetUrl
            )
          ) {
            const scrapedStreams = await this.scrapeStreamsFromWebpage(
              targetUrl,
              item.headers || {}
            );
            for (const s of scrapedStreams) {
              if (!candidateUrls.includes(s)) candidateUrls.push(s);
            }
          }
        }
      }
    }

    // STAGE 3: Fallback to Direct FFmpeg Stream Puller ONLY if we have a real .m3u8 or direct media stream URL
    if (!downloadedTempFile && (item.status as string) !== 'paused') {
      const streamTarget = candidateUrls.find(
        (u) =>
          u.toLowerCase().includes('.m3u8') ||
          /\.(mp4|webm|mkv|mov|flv|mp3|m4a|ts)(\?|$)/i.test(u)
      );

      if (streamTarget) {
        try {
          downloadedTempFile = await this.executeFfmpegDirectStreamPull(
            item,
            streamTarget,
            workDir
          );
        } catch (err: any) {
          if (!lastError) {
            lastError = err?.message || 'Video akışı indirilemedi';
          }
        }
      }
    }

    if ((item.status as string) === 'paused') return;

    if (!downloadedTempFile || !fs.existsSync(downloadedTempFile)) {
      fs.rmSync(workDir, { recursive: true, force: true });
      item.status = 'error';
      item.errorMessage = lastError || 'Bu sitedeki video akışı yakalanamadı.';
      item.speedBps = 0;
      this.saveState();
      this.emit('downloads-updated', this.getAllItems());
      return;
    }

    try {
      // FINAL POST-PROCESSING STAGE:
      // If user requested MP3 / M4A / WAV, convert the downloaded temp file using FFmpeg!
      // This guarantees MP3 conversion works 100% on X (Twitter), YouTube, TikTok, Instagram, and all HLS sites!
      if (isAudioRequest) {
        item.status = 'merging';
        item.category = 'music';
        for (const seg of item.segments) {
          seg.info = 'MP3 / Ses dosyasına dönüştürülüyor (FFmpeg)...';
        }
        this.emit('downloads-updated', this.getAllItems());

        await this.convertTempFileToAudio(downloadedTempFile, item.savePath, fmtId);
      } else {
        // Ensure video is 100% QuickTime / Apple Silicon compatible (H.264 / AVC)
        await this.ensureAppleCompatibleVideo(item, downloadedTempFile, item.savePath);
      }

      // Clean up temp workDir completely
      fs.rmSync(workDir, { recursive: true, force: true });

      if (fs.existsSync(item.savePath)) {
        const st = fs.statSync(item.savePath);
        item.downloadedBytes = st.size;
        item.totalBytes = st.size;
      }

      for (const seg of item.segments) {
        seg.status = 'completed';
        seg.downloadedBytes = seg.endByte;
        seg.speedBps = 0;
        seg.info = 'Tamamlandı';
      }

      item.status = 'completed';
      item.speedBps = 0;
      item.etaSeconds = 0;
      item.completedAt = new Date().toISOString();
      this.saveState();
      this.emit('downloads-updated', this.getAllItems());
      this.emit('download-completed', item);
    } catch (postErr: any) {
      fs.rmSync(workDir, { recursive: true, force: true });
      item.status = 'error';
      item.errorMessage = postErr?.message || 'Dosya dönüştürme/birleştirme hatası';
      item.speedBps = 0;
      this.saveState();
      this.emit('downloads-updated', this.getAllItems());
    }
  }

  /**
   * Runs yt-dlp into an isolated /tmp/idm-pro-work/<id>/media.%(ext)s template
   */
  private executeYtDlpToWorkDir(
    ytDlpBin: string,
    item: DownloadItem,
    targetUrl: string,
    workDir: string,
    isAudioRequest: boolean,
    useCustomHeaders = false
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Clean any previous attempt files in workDir
      for (const f of fs.readdirSync(workDir)) {
        fs.rmSync(path.join(workDir, f), { recursive: true, force: true });
      }

      // Clean YouTube playlist parameters if any so yt-dlp targets the exact video
      let cleanTargetUrl = targetUrl;
      try {
        const u = new URL(targetUrl);
        if (u.hostname.includes('youtube.com') && u.searchParams.has('v')) {
          u.searchParams.delete('list');
          u.searchParams.delete('index');
          u.searchParams.delete('start_radio');
          cleanTargetUrl = u.toString();
        }
      } catch {
        // keep as is
      }

      const numConns = item.connectionsCount || 16;
      const outTemplate = path.join(workDir, 'media.%(ext)s');
      const args: string[] = [
        '--newline',
        '--no-playlist',
        '--no-check-certificates',
        '--geo-bypass',
        '--concurrent-fragments',
        String(numConns),
        '-o',
        outTemplate,
      ];

      const ffmpegBin = this.resolveFfmpegBinary();
      if (ffmpegBin) {
        args.push('--ffmpeg-location', ffmpegBin);
      }

      const fmtId = item.videoFormatId || 'best';
      const heightMatch =
        fmtId.startsWith('height:')
          ? parseInt(fmtId.split(':')[1], 10)
          : fmtId.match(/height<=(\d+)/)
          ? parseInt(fmtId.match(/height<=(\d+)/)![1], 10)
          : 0;

      if (isAudioRequest) {
        // Ensure we pick a stream that actually contains audio:
        // 1. Dedicated audio stream (vcodec=none, e.g. YouTube m4a/opus or X hls-audio)
        // 2. Progressive HTTPS MP4 (e.g. X http-2176 which always has AAC audio muxed in, unlike X's video-only hls-2176!)
        // 3. Merged bestvideo+bestaudio or best fallback
        args.push(
          '-f',
          'bestaudio[vcodec=none]/best[protocol=https]/bestvideo+bestaudio/best',
          '--merge-output-format',
          'mp4'
        );
      } else if (heightMatch > 0) {
        args.push(
          '-S',
          `res:${heightMatch},vcodec:h264,acodec:m4a,ext:mp4:m4a`,
          '-f',
          `bestvideo[height<=${heightMatch}][vcodec^=avc1]+bestaudio[acodec^=mp4a]/best[height<=${heightMatch}][vcodec^=avc1]/bestvideo[height<=${heightMatch}]+bestaudio/best[height<=${heightMatch}]/best`,
          '--merge-output-format',
          'mp4'
        );
      } else if (
        fmtId !== 'best' &&
        fmtId !== 'hls_best' &&
        !fmtId.startsWith('hls_') &&
        !fmtId.startsWith('sniff_') &&
        !fmtId.includes('/') &&
        !fmtId.includes('+')
      ) {
        args.push(
          '-S',
          'vcodec:h264,acodec:m4a,ext:mp4:m4a',
          '-f',
          `${fmtId}+bestaudio[acodec^=mp4a]/${fmtId}+bestaudio/${fmtId}/bestvideo+bestaudio/best`,
          '--merge-output-format',
          'mp4'
        );
      } else {
        args.push(
          '-S',
          'res,vcodec:h264,acodec:m4a,ext:mp4:m4a',
          '-f',
          'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/best[vcodec^=avc1]/bestvideo+bestaudio/best',
          '--merge-output-format',
          'mp4'
        );
      }

      if (this.settings.speedLimitKbps > 0) {
        args.push('--limit-rate', `${this.settings.speedLimitKbps}K`);
      }

      if (useCustomHeaders) {
        const headers: Record<string, string> = {
          'User-Agent': DEFAULT_USER_AGENT,
          ...(item.headers || {}),
        };
        if (item.pageUrl && !headers['Referer']) {
          headers['Referer'] = item.pageUrl;
        }

        for (const [k, v] of Object.entries(headers)) {
          if (v) args.push('--add-header', `${k}:${v}`);
        }
      }

      args.push(cleanTargetUrl);

      const proc = spawn(ytDlpBin, args, {
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`,
        },
      });
      this.activeProcesses.set(item.id, proc);

      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split(/\r?\n/);
        for (const line of lines) {
          this.parseYtDlpProgressLine(item, line);
        }
      });

      let stderrLog = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderrLog += data.toString();
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(item.id);
        if ((item.status as string) === 'paused') {
          resolve('');
          return;
        }

        if (code === 0) {
          const files = fs
            .readdirSync(workDir)
            .filter((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'));
          if (files.length > 0) {
            // Pick the largest finished file in workDir
            const sorted = files
              .map((f) => ({
                full: path.join(workDir, f),
                size: fs.statSync(path.join(workDir, f)).size,
              }))
              .sort((a, b) => b.size - a.size);
            if (sorted[0].size > 0) {
              resolve(sorted[0].full);
              return;
            }
          }
        }
        reject(
          new Error(stderrLog.trim().split('\n').pop() || `yt-dlp çıkış kodu: ${code}`)
        );
      });

      proc.on('error', reject);
    });
  }

  /**
   * Direct FFmpeg Stream Puller for custom HLS (.m3u8) or protected media streams
   */
  private executeFfmpegDirectStreamPull(
    item: DownloadItem,
    streamUrl: string,
    workDir: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpegBin = this.resolveFfmpegBinary();
      if (!ffmpegBin) {
        reject(new Error('FFmpeg bulunamadı'));
        return;
      }

      const outFile = path.join(workDir, 'stream_output.mp4');
      const headers: Record<string, string> = {
        'User-Agent': DEFAULT_USER_AGENT,
        ...(item.headers || {}),
      };
      if (item.pageUrl && !headers['Referer']) {
        headers['Referer'] = item.pageUrl;
      }

      const headerLines = Object.entries(headers)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => `${k}: ${v}\r\n`)
        .join('');

      const args = [
        '-y',
        '-headers',
        headerLines,
        '-i',
        streamUrl,
        '-c',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        outFile,
      ];

      for (const seg of item.segments) {
        seg.info = 'FFmpeg Doğrudan Akış Yakalayıcı ile indiriliyor...';
      }
      this.emit('downloads-updated', this.getAllItems());

      const proc = spawn(ffmpegBin, args);
      this.activeProcesses.set(item.id, proc);

      let durationSec = 0;
      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (durMatch) {
          durationSec =
            parseInt(durMatch[1], 10) * 3600 +
            parseInt(durMatch[2], 10) * 60 +
            parseFloat(durMatch[3]);
        }
        const sizeMatch = text.match(/size=\s*(\d+)kB/i);
        if (sizeMatch) {
          const downloadedBytes = parseInt(sizeMatch[1], 10) * 1024;
          item.downloadedBytes = downloadedBytes;
          if (durationSec > 0) {
            const timeMatch = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
            if (timeMatch) {
              const cur =
                parseInt(timeMatch[1], 10) * 3600 +
                parseInt(timeMatch[2], 10) * 60 +
                parseFloat(timeMatch[3]);
              const pct = Math.min(99, Math.max(1, (cur / durationSec) * 100));
              item.totalBytes = Math.round((downloadedBytes / pct) * 100);
            }
          }
        }
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(item.id);
        if (code === 0 && fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
          resolve(outFile);
        } else {
          reject(new Error(`FFmpeg akış indirme hatası (kod: ${code})`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Converts any downloaded temp media file (.mp4 / .webm / .m4a / .ts) to .mp3 / .m4a / .wav using FFmpeg
   */
  private convertTempFileToAudio(
    inputFile: string,
    outputSavePath: string,
    fmtId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegBin = this.resolveFfmpegBinary();
      if (!ffmpegBin) {
        reject(new Error('FFmpeg bulunamadı'));
        return;
      }

      const parts = fmtId.split(':');
      const audioFormat = parts[1] || 'mp3';
      const bitrate = parts[2] && parts[2] !== '0' ? `${parts[2]}k` : '320k';

      const workDir = path.dirname(inputFile);
      const tempAudioFile = path.join(workDir, `converted_out.${audioFormat}`);
      fs.mkdirSync(path.dirname(outputSavePath), { recursive: true });

      const buildCodecArgs = (): string[] => {
        if (audioFormat === 'mp3') return ['-acodec', 'libmp3lame', '-b:a', bitrate];
        if (audioFormat === 'm4a') return ['-c:a', 'aac', '-b:a', '256k'];
        if (audioFormat === 'wav') return ['-acodec', 'pcm_s16le'];
        return ['-acodec', 'libmp3lame', '-b:a', '320k'];
      };

      const args = ['-y', '-i', inputFile, '-vn', ...buildCodecArgs(), tempAudioFile];

      const proc = spawn(ffmpegBin, args);
      let stderr = '';
      proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(tempAudioFile) && fs.statSync(tempAudioFile).size > 0) {
          fs.copyFileSync(tempAudioFile, outputSavePath);
          resolve();
          return;
        }

        // If the source video was a silent video/GIF with no audio track at all ("does not contain any stream"),
        // synthesize a silent audio stream matching the video's duration so MP3 conversion still succeeds cleanly!
        if (
          stderr.includes('does not contain any stream') ||
          stderr.includes('matches no streams')
        ) {
          const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
          const durSec = durMatch
            ? Math.max(
                1,
                parseInt(durMatch[1], 10) * 3600 +
                  parseInt(durMatch[2], 10) * 60 +
                  parseFloat(durMatch[3])
              )
            : 5;

          const silentArgs = [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'anullsrc=r=44100:cl=stereo',
            '-t',
            String(durSec),
            ...buildCodecArgs(),
            tempAudioFile,
          ];
          const silentProc = spawn(ffmpegBin, silentArgs);
          silentProc.on('close', (code2) => {
            if (
              code2 === 0 &&
              fs.existsSync(tempAudioFile) &&
              fs.statSync(tempAudioFile).size > 0
            ) {
              fs.copyFileSync(tempAudioFile, outputSavePath);
              resolve();
            } else {
              reject(new Error('Videoda ses kanalı bulunamadı.'));
            }
          });
          silentProc.on('error', reject);
          return;
        }

        reject(
          new Error(
            `MP3 dönüştürme hatası: ${stderr.trim().split('\n').pop() || code}`
          )
        );
      });
      proc.on('error', reject);
    });
  }

  /**
   * Ensures the completed video file is 100% compatible with macOS QuickTime Player and Apple devices.
   * If the video track is encoded in VP9 / VP8 / AV1 (which QuickTime cannot open in MP4),
   * this automatically converts the video track to native H.264 (AVC) via hardware acceleration.
   */
  private async ensureAppleCompatibleVideo(
    item: DownloadItem,
    sourceFile: string,
    destinationPath: string
  ): Promise<void> {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

    const ffmpegBin = this.resolveFfmpegBinary();
    const ffprobeBin = this.resolveFfprobeBinary();

    let needsTranscode = false;
    let detectedCodec = '';

    if (ffprobeBin && fs.existsSync(ffprobeBin)) {
      try {
        const probeOut = execSync(
          `"${ffprobeBin}" -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${sourceFile}"`,
          { encoding: 'utf-8', timeout: 8000 }
        ).trim().toLowerCase();

        detectedCodec = probeOut;
        // QuickTime Player and Apple QuickLook cannot open VP9/VP8/AV1 inside MP4!
        if (probeOut && !['h264', 'avc1', 'hevc', 'h265', 'mpeg4'].includes(probeOut)) {
          needsTranscode = true;
        }
      } catch {
        // If ffprobe throws, fall through
      }
    }

    if (!needsTranscode || !ffmpegBin || !fs.existsSync(ffmpegBin)) {
      fs.copyFileSync(sourceFile, destinationPath);
      return;
    }

    item.status = 'merging';
    for (const seg of item.segments) {
      seg.info = `Apple / QuickTime uyumluluğu sağlanıyor (${detectedCodec.toUpperCase()} ➔ H.264)...`;
    }
    this.emit('downloads-updated', this.getAllItems());

    const tempTranscoded = path.join(path.dirname(sourceFile), 'apple_compat_h264.mp4');
    await new Promise<void>((resolve) => {
      const isMac = process.platform === 'darwin';
      const videoEncoder = isMac ? 'h264_videotoolbox' : 'libx264';
      const extraArgs = isMac
        ? ['-b:v', '5000k']
        : ['-preset', 'veryfast', '-crf', '22'];

      const proc = spawn(
        ffmpegBin,
        [
          '-y',
          '-i', sourceFile,
          '-c:v', videoEncoder,
          ...extraArgs,
          '-c:a', 'copy',
          '-movflags', '+faststart',
          tempTranscoded,
        ],
        { stdio: 'ignore' }
      );

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(tempTranscoded) && fs.statSync(tempTranscoded).size > 0) {
          fs.copyFileSync(tempTranscoded, destinationPath);
          try { fs.rmSync(tempTranscoded, { force: true }); } catch {}
          resolve();
        } else {
          // If transcode failed for any reason, fallback to original copy
          fs.copyFileSync(sourceFile, destinationPath);
          resolve();
        }
      });

      proc.on('error', () => {
        fs.copyFileSync(sourceFile, destinationPath);
        resolve();
      });
    });
  }

  /**
   * Scrapes webpage HTML (and 1-level iframe embeds) for .m3u8 and .mp4 stream URLs
   */
  private async scrapeStreamsFromWebpage(
    pageUrl: string,
    headers: Record<string, string>
  ): Promise<string[]> {
    const found: string[] = [];
    try {
      const html = await this.fetchText(pageUrl, { Referer: pageUrl, ...headers });
      this.extractMediaUrlsFromHtml(html, pageUrl, found);

      // Also check embedded player <iframe> sources if no direct stream was in the outer page
      if (found.length === 0) {
        const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        let m: RegExpExecArray | null;
        while ((m = iframeRegex.exec(html)) !== null) {
          try {
            const iframeUrl = new URL(m[1], pageUrl).toString();
            if (iframeUrl.startsWith('http')) {
              found.push(iframeUrl);
              const subHtml = await this.fetchText(iframeUrl, {
                Referer: pageUrl,
                ...headers,
              });
              this.extractMediaUrlsFromHtml(subHtml, iframeUrl, found);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
    return found;
  }

  private extractMediaUrlsFromHtml(html: string, baseUrl: string, out: string[]): void {
    const directMediaRegex =
      /https?:\\?\/\\?\/[^\s"'<>\\]+?\.(?:m3u8|mp4|webm)(?:\?[^\s"'<>\\]*)?/gi;
    let match: RegExpExecArray | null;
    while ((match = directMediaRegex.exec(html)) !== null) {
      const cleaned = match[0].replace(/\\\//g, '/');
      try {
        const u = new URL(cleaned, baseUrl).toString();
        if (!out.includes(u)) out.push(u);
      } catch {
        // ignore
      }
    }

    const srcRegex = /<(?:video|source)[^>]+src=["']([^"']+)["']/gi;
    while ((match = srcRegex.exec(html)) !== null) {
      if (match[1] && !match[1].startsWith('blob:')) {
        try {
          const u = new URL(match[1], baseUrl).toString();
          if (!out.includes(u)) out.push(u);
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * IDM-Style Multi-Connection Dynamic Range Downloader for Direct Files
   * Uses /tmp/idm-pro-work/<id>/file.part so no .part files pollute the user's Desktop!
   */
  private async runDirectMultiSegmentDownload(item: DownloadItem): Promise<void> {
    try {
      if (item.totalBytes === 0 && item.segments.length === 0) {
        try {
          const probe = await this.probeUrl(item.url, item.headers);
          item.url = probe.finalUrl;
          item.totalBytes = probe.totalBytes;
          item.resumable = probe.resumable;
        } catch {
          // Proceed with single stream fallback
        }
      }

      const workDir = this.getWorkDir(item.id);
      const partPath = path.join(workDir, 'download.idm.part');

      if (item.segments.length === 0) {
        if (item.resumable && item.totalBytes > 65536) {
          const numConns = Math.min(
            item.connectionsCount,
            Math.max(1, Math.floor(item.totalBytes / 65536))
          );
          const chunkSize = Math.floor(item.totalBytes / numConns);
          const segments: SegmentState[] = [];
          for (let i = 0; i < numConns; i++) {
            const startByte = i * chunkSize;
            const endByte =
              i === numConns - 1 ? item.totalBytes - 1 : (i + 1) * chunkSize - 1;
            segments.push({
              id: i + 1,
              startByte,
              endByte,
              downloadedBytes: 0,
              status: 'idle',
              speedBps: 0,
              info: 'Bekliyor...',
            });
          }
          item.segments = segments;
        } else {
          item.resumable = false;
          item.segments = [
            {
              id: 1,
              startByte: 0,
              endByte: item.totalBytes > 0 ? item.totalBytes - 1 : -1,
              downloadedBytes: 0,
              status: 'idle',
              speedBps: 0,
              info: 'Tekli Akış Bağlantısı',
            },
          ];
        }
      }

      const flags = fs.existsSync(partPath) && item.resumable ? 'r+' : 'w+';
      const fileHandle = await fs.promises.open(partPath, flags);
      if (item.totalBytes > 0 && flags === 'w+') {
        await fileHandle.truncate(item.totalBytes);
      }
      this.activeFileHandles.set(item.id, fileHandle);

      const ctrlMap = new Map<number, ActiveSegmentController>();
      this.activeControllers.set(item.id, ctrlMap);

      item.status = 'downloading';
      this.saveState();
      this.emit('downloads-updated', this.getAllItems());

      const workers = item.segments
        .filter((s) => s.status !== 'completed')
        .map((seg) => this.downloadSegmentWorker(item, seg, fileHandle, ctrlMap));

      await Promise.all(workers);

      const allCompleted = item.segments.every((s) => s.status === 'completed');
      if (allCompleted && item.status === 'downloading') {
        item.status = 'merging';
        this.emit('downloads-updated', this.getAllItems());

        await fileHandle.close();
        this.activeFileHandles.delete(item.id);
        this.activeControllers.delete(item.id);

        const fmtId = item.videoFormatId || '';
        const isAudioRequest = fmtId === 'bestaudio-mp3' || fmtId.startsWith('audio:');

        if (isAudioRequest) {
          item.category = 'music';
          for (const seg of item.segments) {
            seg.info = 'MP3 / Ses dosyasına dönüştürülüyor (FFmpeg)...';
          }
          this.emit('downloads-updated', this.getAllItems());
          await this.convertTempFileToAudio(partPath, item.savePath, fmtId);
        } else {
          fs.mkdirSync(path.dirname(item.savePath), { recursive: true });
          fs.copyFileSync(partPath, item.savePath);
        }

        fs.rmSync(workDir, { recursive: true, force: true });

        if (fs.existsSync(item.savePath)) {
          const st = fs.statSync(item.savePath);
          item.downloadedBytes = st.size;
          item.totalBytes = st.size;
        } else {
          item.downloadedBytes =
            item.totalBytes > 0
              ? item.totalBytes
              : item.segments.reduce((acc, s) => acc + s.downloadedBytes, 0);
          item.totalBytes = item.downloadedBytes;
        }

        item.status = 'completed';
        item.speedBps = 0;
        item.etaSeconds = 0;
        item.completedAt = new Date().toISOString();
        this.saveState();
        this.emit('downloads-updated', this.getAllItems());
        this.emit('download-completed', item);
      }
    } catch (err: any) {
      await this.closeFileHandleIfOpen(item.id);
      if (item.status !== 'paused') {
        item.status = 'error';
        item.errorMessage = err?.message || 'İndirme hatası oluştu';
        item.speedBps = 0;
        this.saveState();
        this.emit('downloads-updated', this.getAllItems());
      }
    }
  }

  private async downloadSegmentWorker(
    item: DownloadItem,
    seg: SegmentState,
    fileHandle: fs.promises.FileHandle,
    ctrlMap: Map<number, ActiveSegmentController>
  ): Promise<void> {
    while (item.status === 'downloading') {
      const controller: ActiveSegmentController = { aborted: false };
      ctrlMap.set(seg.id, controller);

      try {
        await this.executeSingleRangeRequest(item, seg, fileHandle, controller);
      } catch (err: any) {
        if (controller.aborted || (item.status as string) !== 'downloading') {
          return;
        }
        seg.status = 'error';
        seg.info = `Hata: ${err?.message || 'Bağlantı koptu'}`;
        throw err;
      }

      if (controller.aborted || (item.status as string) !== 'downloading') {
        return;
      }

      if (item.resumable && item.totalBytes > 0) {
        const stolen = this.tryStealSubSegment(item, seg);
        if (stolen) {
          continue;
        }
      }
      break;
    }
  }

  private tryStealSubSegment(item: DownloadItem, idleSeg: SegmentState): boolean {
    const MIN_STEAL_BYTES = 1024 * 1024;
    let candidate: SegmentState | null = null;
    let maxRemaining = 0;

    for (const s of item.segments) {
      if (s.id !== idleSeg.id && s.status === 'downloading' && s.endByte > s.startByte) {
        const currentPos = s.startByte + s.downloadedBytes;
        const remaining = s.endByte - currentPos + 1;
        if (remaining > maxRemaining && remaining >= MIN_STEAL_BYTES) {
          maxRemaining = remaining;
          candidate = s;
        }
      }
    }

    if (!candidate) return false;

    const candidateCurrentPos = candidate.startByte + candidate.downloadedBytes;
    const halfRemaining = Math.floor(maxRemaining / 2);
    const splitPoint = candidateCurrentPos + halfRemaining;

    if (splitPoint >= candidate.endByte) return false;

    const oldEnd = candidate.endByte;
    candidate.endByte = splitPoint - 1;

    idleSeg.startByte = splitPoint;
    idleSeg.endByte = oldEnd;
    idleSeg.downloadedBytes = 0;
    idleSeg.status = 'connecting';
    idleSeg.info = `Yardım ediliyor (Parça #${candidate.id} bölündü)`;

    return true;
  }

  private executeSingleRangeRequest(
    item: DownloadItem,
    seg: SegmentState,
    fileHandle: fs.promises.FileHandle,
    controller: ActiveSegmentController
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const rangeStart = seg.startByte + seg.downloadedBytes;
      if (seg.endByte >= 0 && rangeStart > seg.endByte) {
        seg.status = 'completed';
        seg.speedBps = 0;
        seg.info = 'Tamamlandı';
        resolve();
        return;
      }

      seg.status = 'connecting';
      seg.info = 'Sunucuya bağlanılıyor...';

      const parsedUrl = new URL(item.url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const headers: Record<string, string> = {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: '*/*',
        ...(item.headers || {}),
      };

      if (item.resumable && seg.endByte >= 0) {
        headers['Range'] = `bytes=${rangeStart}-${seg.endByte}`;
      }

      const req = client.request(
        parsedUrl,
        {
          method: 'GET',
          headers,
          rejectUnauthorized: false,
        },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            item.url = new URL(res.headers.location, item.url).toString();
            this.executeSingleRangeRequest(item, seg, fileHandle, controller)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (status < 200 || status >= 300) {
            res.resume();
            reject(new Error(`HTTP ${status}`));
            return;
          }

          seg.status = 'downloading';
          seg.info = 'Alınıyor...';

          let segLastBytes = seg.downloadedBytes;
          let segLastTime = Date.now();
          let writeChain = Promise.resolve();
          let settled = false;

          const finishSegment = () => {
            if (settled) return;
            settled = true;
            seg.status = 'completed';
            seg.speedBps = 0;
            seg.info = 'Tamamlandı';
            res.destroy();
            resolve();
          };

          res.on('data', (chunk: Buffer) => {
            if (settled || controller.aborted || item.status !== 'downloading') {
              res.destroy();
              return;
            }

            res.pause();

            writeChain = writeChain
              .then(async () => {
                if (settled || controller.aborted || item.status !== 'downloading') return;

                const writeOffset = seg.startByte + seg.downloadedBytes;
                let bytesToWrite = chunk.length;
                if (seg.endByte >= 0 && writeOffset + bytesToWrite - 1 > seg.endByte) {
                  bytesToWrite = Math.max(0, seg.endByte - writeOffset + 1);
                }

                if (bytesToWrite <= 0) {
                  finishSegment();
                  return;
                }

                await fileHandle.write(chunk, 0, bytesToWrite, writeOffset);
                seg.downloadedBytes += bytesToWrite;
                item.downloadedBytes += bytesToWrite;

                const now = Date.now();
                const dt = (now - segLastTime) / 1000;
                if (dt >= 0.4) {
                  seg.speedBps = Math.round((seg.downloadedBytes - segLastBytes) / dt);
                  segLastBytes = seg.downloadedBytes;
                  segLastTime = now;
                }

                if (this.settings.speedLimitKbps > 0) {
                  const maxBps = this.settings.speedLimitKbps * 1024;
                  const activeCount =
                    item.segments.filter((s) => s.status === 'downloading').length || 1;
                  const perSegBps = maxBps / activeCount;
                  const expectedMs = (bytesToWrite / perSegBps) * 1000;
                  if (expectedMs > 5) {
                    await new Promise((r) => setTimeout(r, Math.min(250, expectedMs)));
                  }
                }

                if (seg.endByte >= 0 && seg.startByte + seg.downloadedBytes - 1 >= seg.endByte) {
                  finishSegment();
                  return;
                }

                if (!settled && !controller.aborted && item.status === 'downloading') {
                  res.resume();
                }
              })
              .catch((writeErr) => {
                if (!settled) {
                  settled = true;
                  res.destroy();
                  reject(writeErr);
                }
              });
          });

          res.on('end', () => {
            writeChain
              .then(() => {
                if (settled) return;
                settled = true;
                if (!controller.aborted) {
                  seg.status = 'completed';
                  seg.speedBps = 0;
                  seg.info = 'Tamamlandı';
                }
                resolve();
              })
              .catch((err) => {
                if (!settled) {
                  settled = true;
                  reject(err);
                }
              });
          });

          res.on('error', (err) => {
            if (controller.aborted) {
              resolve();
            } else if (!settled) {
              settled = true;
              reject(err);
            }
          });
        }
      );

      controller.req = req;
      req.on('error', (err) => {
        if (controller.aborted) {
          resolve();
        } else {
          reject(err);
        }
      });

      req.end();
    });
  }

  private parseYtDlpProgressLine(item: DownloadItem, line: string): void {
    if (line.includes('[ExtractAudio]')) {
      item.status = 'merging';
      for (const seg of item.segments) {
        seg.info = 'MP3 / Ses formatına dönüştürülüyor (FFmpeg)...';
      }
      return;
    }

    if (line.includes('[Merger]') || line.includes('Merging formats')) {
      item.status = 'merging';
      for (const seg of item.segments) {
        seg.info = 'Ses ve görüntü birleştiriliyor (FFmpeg)...';
      }
      return;
    }

    const pctMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    const sizeMatch = line.match(/of\s+~?\s*(\d+(?:\.\d+)?)(KiB|MiB|GiB|B)/i);
    const speedMatch = line.match(/at\s+(\d+(?:\.\d+)?)(KiB|MiB|GiB|B)\/s/i);
    const etaMatch = line.match(/ETA\s+(\d+):(\d+)/);

    if (sizeMatch) {
      item.totalBytes = this.unitToBytes(parseFloat(sizeMatch[1]), sizeMatch[2]);
    }

    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]);
      if (item.totalBytes > 0) {
        item.downloadedBytes = Math.round((pct / 100) * item.totalBytes);
      }
      const perSegBytes = Math.floor(item.downloadedBytes / Math.max(1, item.segments.length));
      const perSegTotal = Math.floor((item.totalBytes || 100) / Math.max(1, item.segments.length));
      for (const seg of item.segments) {
        seg.endByte = perSegTotal;
        seg.downloadedBytes = perSegBytes;
        seg.info = `%${pct.toFixed(1)} İndiriliyor`;
      }
    }

    if (speedMatch) {
      item.speedBps = this.unitToBytes(parseFloat(speedMatch[1]), speedMatch[2]);
      const perSegSpeed = Math.round(item.speedBps / Math.max(1, item.segments.length));
      for (const seg of item.segments) {
        seg.speedBps = perSegSpeed;
      }
    }

    if (etaMatch) {
      item.etaSeconds = parseInt(etaMatch[1], 10) * 60 + parseInt(etaMatch[2], 10);
    }
  }

  private unitToBytes(val: number, unit: string): number {
    const u = unit.toUpperCase();
    if (u.startsWith('G')) return Math.round(val * 1024 * 1024 * 1024);
    if (u.startsWith('M')) return Math.round(val * 1024 * 1024);
    if (u.startsWith('K')) return Math.round(val * 1024);
    return Math.round(val);
  }

  public async pauseDownload(id: string): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;

    item.status = 'paused';
    item.speedBps = 0;
    item.etaSeconds = null;

    const ctrls = this.activeControllers.get(id);
    if (ctrls) {
      for (const ctrl of ctrls.values()) {
        ctrl.aborted = true;
        ctrl.req?.destroy();
      }
      this.activeControllers.delete(id);
    }

    const proc = this.activeProcesses.get(id);
    if (proc) {
      proc.kill('SIGTERM');
      this.activeProcesses.delete(id);
    }

    await this.closeFileHandleIfOpen(id);

    for (const seg of item.segments) {
      if (seg.status !== 'completed') {
        seg.status = 'paused';
        seg.speedBps = 0;
        seg.info = 'Duraklatıldı';
      }
    }

    this.saveState();
    this.emit('downloads-updated', this.getAllItems());
  }

  public async pauseAll(): Promise<void> {
    for (const item of this.items.values()) {
      if (item.status === 'downloading' || item.status === 'connecting') {
        await this.pauseDownload(item.id);
      }
    }
  }

  public async resumeAll(): Promise<void> {
    for (const item of this.items.values()) {
      if (item.status === 'paused' || item.status === 'error' || item.status === 'queued') {
        this.startDownload(item.id);
      }
    }
  }

  public async deleteDownload(id: string, deleteFileFromDisk = false): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;

    await this.pauseDownload(id);
    this.items.delete(id);

    try {
      const workDir = path.join(this.tempRootDir, id);
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
      if (deleteFileFromDisk && fs.existsSync(item.savePath)) {
        fs.unlinkSync(item.savePath);
      }
    } catch (err) {
      console.error('Error removing files on delete:', err);
    }

    this.saveState();
    this.emit('downloads-updated', this.getAllItems());
  }

  private async closeFileHandleIfOpen(id: string): Promise<void> {
    const handle = this.activeFileHandles.get(id);
    if (handle) {
      this.activeFileHandles.delete(id);
      try {
        await handle.close();
      } catch {
        // Ignore already closed
      }
    }
  }

  private resolveFfmpegBinary(): string | null {
    const candidates = [
      this.settings.ffmpegPath,
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
    ].filter(Boolean);

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private resolveFfprobeBinary(): string | null {
    const ffmpeg = this.resolveFfmpegBinary();
    if (ffmpeg) {
      const probeCandidate = path.join(path.dirname(ffmpeg), 'ffprobe');
      if (fs.existsSync(probeCandidate)) return probeCandidate;
    }
    const candidates = [
      '/opt/homebrew/bin/ffprobe',
      '/usr/local/bin/ffprobe',
      '/usr/bin/ffprobe',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  public resolveYtDlpBinary(): string | null {
    const candidates = [
      this.settings.ytDlpPath,
      '/opt/homebrew/bin/yt-dlp',
      '/usr/local/bin/yt-dlp',
      path.join(process.env.HOME || '', '.local/bin/yt-dlp'),
    ].filter(Boolean);

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private fetchText(url: string, headers?: Record<string, string>): Promise<string> {
    return this.fetchBuffer(url, headers).then((b) => b.toString('utf-8'));
  }

  private fetchBuffer(
    targetUrl: string,
    customHeaders: Record<string, string> = {},
    redirects = 0
  ): Promise<Buffer> {
    if (redirects > 6) return Promise.reject(new Error('Too many redirects'));
    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise<Buffer>((resolve, reject) => {
      const req = client.request(
        parsedUrl,
        {
          method: 'GET',
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: '*/*',
            ...customHeaders,
          },
          rejectUnauthorized: false,
          timeout: 8000,
        },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            this.fetchBuffer(nextUrl, customHeaders, redirects + 1)
              .then(resolve)
              .catch(reject);
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            reject(new Error(`HTTP ${status}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.end();
    });
  }
}
