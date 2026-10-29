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

export interface EngineStatus {
  ytDlpInstalled: boolean;
  ytDlpPath: string | null;
  ffmpegInstalled: boolean;
  ffmpegPath: string | null;
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

declare global {
  interface Window {
    idmApi?: {
      getDownloads: () => Promise<DownloadItem[]>;
      probeUrl: (url: string, headers?: Record<string, string>) => Promise<ProbeResult>;
      addDownload: (options: {
        url: string;
        fileName?: string;
        saveDir?: string;
        connectionsCount?: number;
        sourceType?: 'direct' | 'yt-dlp' | 'hls';
        videoFormatId?: string;
        videoResolution?: string;
        headers?: Record<string, string>;
        pageUrl?: string;
        description?: string;
        totalBytes?: number;
        autoStart?: boolean;
      }) => Promise<DownloadItem>;
      startDownload: (id: string) => Promise<DownloadItem[]>;
      pauseDownload: (id: string) => Promise<DownloadItem[]>;
      pauseAll: () => Promise<DownloadItem[]>;
      resumeAll: () => Promise<DownloadItem[]>;
      deleteDownload: (id: string, deleteFile: boolean) => Promise<DownloadItem[]>;
      openFileLocation: (savePath: string) => Promise<boolean>;
      openFile: (savePath: string) => Promise<boolean>;
      selectDirectory: () => Promise<string | null>;
      selectMediaFile: () => Promise<string | null>;
      convertMedia: (
        inputPath: string,
        targetFormat: 'mp3-320' | 'mp3-192' | 'm4a' | 'wav' | 'mp4-h264'
      ) => Promise<{ ok: boolean; outputPath: string; sizeBytes: number }>;
      getSettings: () => Promise<EngineSettings>;
      updateSettings: (partial: Partial<EngineSettings>) => Promise<EngineSettings>;
      analyzeVideo: (
        url: string,
        headers?: Record<string, string>
      ) => Promise<VideoAnalysisResult>;
      getEngineStatus: () => Promise<EngineStatus>;
      installYtDlp: () => Promise<{ ok: boolean; binPath: string; status: EngineStatus }>;
      getSniffedItems: () => Promise<SniffedMediaItem[]>;
      clearSniffedItems: () => Promise<void>;
      openSnifferBrowser: (url: string) => Promise<boolean>;
      onDownloadsUpdated: (cb: (items: DownloadItem[]) => void) => () => void;
      onDownloadCompleted: (cb: (item: DownloadItem) => void) => () => void;
      onSnifferUpdated: (cb: (items: SniffedMediaItem[]) => void) => () => void;
      onYtDlpInstallProgress: (
        cb: (data: { pct: number; statusText: string }) => void
      ) => () => void;
      onConvertProgress: (
        cb: (data: { inputPath: string; pct: number }) => void
      ) => () => void;
    };
  }
}
