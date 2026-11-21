export type DownloadCategory =
  | 'all'
  | 'compressed'
  | 'documents'
  | 'music'
  | 'programs'
  | 'video';

export type AppLanguage = 'tr' | 'en';

export type DownloadStatus =
  | 'queued'
  | 'connecting'
  | 'downloading'
  | 'merging'
  | 'paused'
  | 'completed'
  | 'error';

export interface SegmentState {
  id: number;
  startByte: number;
  endByte: number;
  downloadedBytes: number;
  status: 'idle' | 'connecting' | 'downloading' | 'completed' | 'paused' | 'error';
  speedBps: number;
  info: string;
}

export interface ClipRange {
  startTime: string;
  endTime?: string;
}

export interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  savePath: string;
  category: Exclude<DownloadCategory, 'all'>;
  totalBytes: number;
  downloadedBytes: number;
  status: DownloadStatus;
  resumable: boolean;
  speedBps: number;
  etaSeconds: number | null;
  connectionsCount: number;
  segments: SegmentState[];
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  sourceType: 'direct' | 'yt-dlp' | 'hls';
  videoFormatId?: string;
  videoResolution?: string;
  headers?: Record<string, string>;
  pageUrl?: string;
  fallbackStreamUrls?: string[];
  description?: string;
  clipRange?: ClipRange;
}

export interface VideoFormatOption {
  formatId: string;
  ext: string;
  resolution: string;
  fps?: number;
  filesize?: number;
  vcodec?: string;
  acodec?: string;
  tbr?: number;
  note: string;
  isAudioOnly: boolean;
  needsMerge: boolean;
  streamUrl?: string;
  protocol: 'https' | 'm3u8' | 'dash' | 'yt-dlp';
}

export interface VideoAnalysisResult {
  url: string;
  title: string;
  thumbnail?: string;
  durationSeconds?: number;
  uploader?: string;
  extractor: 'yt-dlp' | 'hls-native' | 'direct-media' | 'html-scraper';
  formats: VideoFormatOption[];
  headers?: Record<string, string>;
}

export interface SniffedMediaItem {
  id: string;
  url: string;
  pageUrl: string;
  pageTitle: string;
  mimeType: string;
  ext: string;
  sizeBytes: number;
  resolution?: string;
  timestamp: string;
  headers: Record<string, string>;
}

export interface EngineSettings {
  downloadDir: string;
  maxConnectionsPerDownload: number;
  maxConcurrentDownloads: number;
  speedLimitKbps: number;
  autoStartDownloads: boolean;
  clipboardMonitor: boolean;
  ytDlpPath: string;
  ffmpegPath: string;
  language?: AppLanguage;
  youtubeAntiBot?: boolean;
  youtubeBrowserCookies?: 'none' | 'chrome' | 'safari' | 'firefox' | 'brave';
}

/**
 * Converts a standard vimeo.com/<id>[/<hash>] page URL to its player.vimeo.com/video/<id> embed URL.
 * Returns null if the URL is not a convertible vimeo.com video page.
 */
export function toVimeoPlayerUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    if (host === 'player.vimeo.com' || !host.endsWith('vimeo.com')) return null;

    const parts = u.pathname.split('/').filter(Boolean);
    let videoId = '';
    let hash = u.searchParams.get('h') || '';

    for (let i = 0; i < parts.length; i++) {
      if (/^\d{5,}$/.test(parts[i])) {
        videoId = parts[i];
        if (!hash && parts[i + 1] && /^[a-f0-9]{6,}$/i.test(parts[i + 1])) {
          hash = parts[i + 1];
        }
        break;
      }
    }

    if (!videoId) return null;
    return hash
      ? `https://player.vimeo.com/video/${videoId}?h=${hash}`
      : `https://player.vimeo.com/video/${videoId}`;
  } catch {
    return null;
  }
}
