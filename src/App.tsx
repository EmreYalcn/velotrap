import React, { useEffect, useMemo, useState } from 'react';
import logoImg from './assets/logo.png';
import {
  Activity,
  Check,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Film,
  FolderOpen,
  Globe,
  HardDrive,
  Link2,
  Music,
  Pause,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Scissors,
  Search,
  Settings,
  Sun,
  Moon,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  AppLanguage,
  DownloadCategory,
  DownloadItem,
  EngineSettings,
  EngineStatus,
  SniffedMediaItem,
} from './types/idm';
import {
  formatBytes,
  formatEta,
  formatSpeed,
  getStatusLabel,
} from './utils/formatters';
import { VideoGrabberModal } from './components/VideoGrabberModal';
import {
  AddUrlModal,
  ConverterModal,
  ExtensionModal,
  SettingsModal,
  SnifferModal,
} from './components/Modals';
import { t } from './i18n/translations';

const DEFAULT_SETTINGS: EngineSettings = {
  downloadDir: '~/Downloads/Velotrap',
  maxConnectionsPerDownload: 16,
  maxConcurrentDownloads: 5,
  speedLimitKbps: 0,
  autoStartDownloads: true,
  clipboardMonitor: true,
  ytDlpPath: '',
  ffmpegPath: '/opt/homebrew/bin/ffmpeg',
  language: 'tr',
};

export function App() {
  const [appVersion, setAppVersion] = useState('3.2.0');
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'video' | 'music'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unfinished' | 'finished'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('velotrap_dark_mode');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('velotrap_dark_mode', String(next));
      return next;
    });
  };
  
  // Dedicated input states for Video & MP3 cards
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [audioUrlInput, setAudioUrlInput] = useState('');

  const [settings, setSettings] = useState<EngineSettings>(DEFAULT_SETTINGS);
  const lang: AppLanguage = settings.language || 'tr';
  const isEn = lang === 'en';
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({
    ytDlpInstalled: true,
    ytDlpPath: null,
    ffmpegInstalled: true,
    ffmpegPath: '/opt/homebrew/bin/ffmpeg',
  });
  const [ytDlpProgress, setYtDlpProgress] = useState<{
    pct: number;
    statusText: string;
  } | null>(null);

  const [sniffedItems, setSniffedItems] = useState<SniffedMediaItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showSnifferModal, setShowSnifferModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [showConverterModal, setShowConverterModal] = useState(false);
  const [converterInitialFile, setConverterInitialFile] = useState('');
  const [converterInitialUrl, setConverterInitialUrl] = useState('');
  const [modalInitialUrl, setModalInitialUrl] = useState('');

  const [extensionStatus, setExtensionStatus] = useState<{
    isInstalled: boolean;
    version: string | null;
    lastSeenAt: number | null;
    extensionPath: string;
  }>({
    isInstalled: false,
    version: null,
    lastSeenAt: null,
    extensionPath: '',
  });

  const handleStartExtensionInstall = () => {
    if ((window.idmApi as any)?.installExtensionHelper) {
      (window.idmApi as any).installExtensionHelper();
    }
    setShowExtensionModal(true);
  };

  useEffect(() => {
    const api = window.idmApi;
    if (!api) return;

    const checkExt = async () => {
      try {
        const res = await fetch('http://127.0.0.1:46890/api/status');
        if (res.ok) {
          const data = await res.json();
          const extObj = data.extension || {};
          const isInst = Boolean(
            extObj.isInstalled ||
            data.extensionInstalled ||
            (extObj.lastSeenAt && Date.now() - extObj.lastSeenAt < 60000)
          );
          setExtensionStatus({
            isInstalled: isInst,
            version: extObj.version || data.extensionVersion || '1.2.0',
            lastSeenAt: extObj.lastSeenAt || data.lastExtensionPing || Date.now(),
            extensionPath: extObj.extensionPath || data.extensionPath || '',
          });
        }
      } catch {}
    };

    checkExt();
    const extInterval = setInterval(checkExt, 3500);

    api.getDownloads().then((list) => {
      setDownloads(list);
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      }
    });
    api.getSettings().then(setSettings);
    api.getEngineStatus().then(setEngineStatus);
    api.getSniffedItems().then(setSniffedItems);

    const unsubDownloads = api.onDownloadsUpdated((items) => {
      setDownloads(items);
    });
    const unsubSniffer = api.onSnifferUpdated((items) => {
      setSniffedItems(items);
    });
    const unsubYtDlp = api.onYtDlpInstallProgress((data) => {
      setYtDlpProgress(data);
    });

    return () => {
      clearInterval(extInterval);
      unsubDownloads();
      unsubSniffer();
      unsubYtDlp();
    };
  }, []);

  const selectedItem = useMemo(
    () => downloads.find((d) => d.id === selectedId) || null,
    [downloads, selectedId]
  );

  const filteredDownloads = useMemo(() => {
    return downloads.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (statusFilter === 'finished' && item.status !== 'completed') return false;
      if (statusFilter === 'unfinished' && item.status === 'completed') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.fileName.toLowerCase().includes(q) ||
          item.url.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [downloads, categoryFilter, statusFilter, searchQuery]);

  const totalActiveSpeed = useMemo(
    () =>
      downloads.reduce(
        (sum, d) => (d.status === 'downloading' ? sum + (d.speedBps || 0) : sum),
        0
      ),
    [downloads]
  );

  const activeDownloads = useMemo(
    () =>
      downloads.filter(
        (d) =>
          d.status === 'downloading' ||
          d.status === 'connecting' ||
          d.status === 'merging'
      ),
    [downloads]
  );

  const completedDownloads = useMemo(
    () => downloads.filter((d) => d.status === 'completed'),
    [downloads]
  );

  const videoCount = useMemo(
    () => downloads.filter((d) => d.category === 'video').length,
    [downloads]
  );

  const musicCount = useMemo(
    () => downloads.filter((d) => d.category === 'music').length,
    [downloads]
  );

  const handleAddDownload = async (options: {
    url: string;
    fileName?: string;
    saveDir?: string;
    connectionsCount?: number;
    sourceType?: 'direct' | 'yt-dlp' | 'hls';
    videoFormatId?: string;
    videoResolution?: string;
    headers?: Record<string, string>;
    totalBytes?: number;
    autoStart?: boolean;
  }) => {
    if (!window.idmApi) return;
    const created = await window.idmApi.addDownload(options);
    setSelectedId(created.id);
  };

  const handleStart = async (id: string) => {
    if (window.idmApi) {
      const updated = await window.idmApi.startDownload(id);
      setDownloads(updated);
    }
  };

  const handlePause = async (id: string) => {
    if (window.idmApi) {
      const updated = await window.idmApi.pauseDownload(id);
      setDownloads(updated);
    }
  };

    const handleQueueDownload = async (url: string, category: 'video' | 'music') => {
    const clean = url.trim();
    if (!clean) return;
    if (category === 'video') setVideoUrlInput('');
    else setAudioUrlInput('');

    try {
      const isYt = clean.includes('youtube.com') || clean.includes('youtu.be');
      const isTiktok = clean.includes('tiktok.com');
      const ext = category === 'music' ? 'mp3' : 'mp4';
      const fallbackName = `${category === 'music' ? 'Müzik' : 'Video'}_${Date.now()}.${ext}`;

      if (window.idmApi) {
        await window.idmApi.addDownload({
          url: clean,
          fileName: fallbackName,
          connectionsCount: settings.maxConnectionsPerDownload || 16,
          sourceType: isYt || isTiktok ? 'yt-dlp' : 'direct',
          videoFormatId: category === 'music' ? 'bestaudio' : 'best',
          autoStart: false,
        });
      }
    } catch (err) {
      console.error('Queue add failed:', err);
    }
  };

    const handleClearCompleted = async () => {
    if (!window.idmApi) return;
    const toClear = downloads.filter((d) => d.status === 'completed');
    if (toClear.length === 0) return;
    for (const item of toClear) {
      await window.idmApi.deleteDownload(item.id, false);
    }
    const updated = await window.idmApi.getDownloads();
    setDownloads(updated);
  };

  const handleDelete = async (id: string, deleteDisk = false) => {
    if (window.idmApi) {
      const updated = await window.idmApi.deleteDownload(id, deleteDisk);
      setDownloads(updated);
      if (selectedId === id) {
        setSelectedId(updated[0]?.id || null);
      }
    }
  };

  return (
    <div className={`idm-app-shell liquid-glass-theme ${isDarkMode ? "theme-pitch-dark" : "theme-liquid-light"}`}>
      {/* Dynamic Liquid Glass Shimmer Canvas */}
      <div className="liquid-canvas-bg" />

      {/* Main Glass Workspace Window */}
      <div className="liquid-window">
        {/* Left Liquid Glass Sidebar */}
        <aside className="liquid-sidebar">
          {/* Logo & Brand Header (Clean, Traffic lights completely removed) */}
          <div className="liquid-brand-row">
            <img src={logoImg} className="liquid-logo-img" alt="Velotrap" />
            <div className="liquid-brand-meta">
              <span className="liquid-brand-title">Velotrap</span>
              <span className="liquid-brand-ver">v{appVersion}</span>
            </div>
          </div>

          {/* Navigation Section */}
          <div className="liquid-nav-group">
            <button
              className={`liquid-nav-item ${statusFilter === 'all' && categoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => {
                setStatusFilter('all');
                setCategoryFilter('all');
              }}
            >
              <HardDrive size={15} />
              <span className="nav-title">{isEn ? 'All' : 'Tümü'}</span>
              <span className="nav-count">({downloads.length})</span>
            </button>

            <button
              className={`liquid-nav-item ${statusFilter === 'unfinished' ? 'active' : ''}`}
              onClick={() => {
                setStatusFilter('unfinished');
                setCategoryFilter('all');
              }}
            >
              <div className="nav-glow-pulse" />
              <span className="nav-title">{isEn ? 'Active' : 'İndiriliyor'}</span>
              <span className="nav-count">({activeDownloads.length})</span>
            </button>

            <button
              className={`liquid-nav-item ${statusFilter === 'finished' ? 'active' : ''}`}
              onClick={() => {
                setStatusFilter('finished');
                setCategoryFilter('all');
              }}
            >
              <CheckCircle2 size={15} className="text-emerald" />
              <span className="nav-title">{isEn ? 'Completed' : 'Tamamlanan'}</span>
              <span className="nav-count">({completedDownloads.length})</span>
            </button>
          </div>

          <div className="liquid-divider" />

          {/* Categories: ONLY Videos & Audio as requested */}
          <div className="liquid-nav-group">
            <div className="liquid-section-label">{isEn ? 'CATEGORIES' : 'KATEGORİLER'}</div>
            
            <button
              className={`liquid-nav-item ${categoryFilter === 'video' ? 'active' : ''}`}
              onClick={() => {
                setCategoryFilter('video');
                setStatusFilter('all');
              }}
            >
              <Film size={15} className="text-sky" />
              <span className="nav-title">{isEn ? 'Videos' : 'Videolar'}</span>
              <span className="nav-count">({videoCount})</span>
            </button>

            <button
              className={`liquid-nav-item ${categoryFilter === 'music' ? 'active' : ''}`}
              onClick={() => {
                setCategoryFilter('music');
                setStatusFilter('all');
              }}
            >
              <Music size={15} className="text-rose" />
              <span className="nav-title">{isEn ? 'Audio / MP3' : 'Sesler & Müzik'}</span>
              <span className="nav-count">({musicCount})</span>
            </button>
          </div>

          {/* Sidebar Footer Disk Info */}
          <div className="liquid-sidebar-footer">
            <div className="liquid-disk-pill">
              <HardDrive size={13} className="text-muted" />
              <div className="disk-meta">
                <span className="disk-label">Macintosh HD</span>
                <span className="disk-free">{isEn ? '16x Parallel Engine' : '16x Hızlı Motor'}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center Main Stage */}
        <main className="liquid-main-stage">
          {/* Main Content Bento Area */}
          <div className="liquid-bento-grid">
            {/* Left Column: Compact Input Strips + Full Height History */}
            <div className="liquid-left-column">
              {/* Dual Strips (Compact) */}
              <div className="liquid-dual-strips-box">
                {/* 1. Long Strip: Video Downloader */}
                <div className="liquid-strip-card video-strip">
                  <div className="strip-header">
                    <div className="strip-title-group">
                      <div className="strip-icon-badge video-badge">
                        <Film size={14} />
                      </div>
                      <div>
                        <h3 className="strip-title">{isEn ? 'Video Downloader' : 'Video İndirme'}</h3>
                        <p className="strip-desc">{isEn ? 'YouTube, TikTok, Instagram, X (4K 60fps)' : 'YouTube, TikTok, Instagram, X (4K 60fps)'}</p>
                      </div>
                    </div>
                    <span className="strip-tag-pill">4K • 1080p • HLS</span>
                  </div>

                  <div className="strip-input-bar">
                    <Link2 size={14} className="strip-input-icon" />
                    <input
                      type="text"
                      className="strip-input-field"
                      placeholder={isEn ? 'Paste video URL (YouTube, TikTok, X)...' : 'Video bağlantısını yapıştırın (YouTube, TikTok, X)...'}
                      value={videoUrlInput}
                      onChange={(e) => setVideoUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && videoUrlInput.trim()) {
                          setModalInitialUrl(videoUrlInput.trim());
                          setVideoUrlInput('');
                          setShowVideoModal(true);
                        }
                      }}
                    />
                    <button
                      className="liquid-btn-glass-queue"
                      title={isEn ? 'Queue to History without starting' : 'Başlatmadan Geçmiş listesine sıraya ekle'}
                      onClick={() => handleQueueDownload(videoUrlInput, 'video')}
                    >
                      <Clock size={12} />
                      <span>{isEn ? 'Queue' : 'Sıraya Al'}</span>
                    </button>
                    <button
                      className="liquid-btn-primary"
                      onClick={() => {
                        setModalInitialUrl(videoUrlInput.trim());
                        setVideoUrlInput('');
                        setShowVideoModal(true);
                      }}
                    >
                      <Zap size={12} />
                      <span>{isEn ? 'Download Video' : 'Videoyu İndir'}</span>
                    </button>
                  </div>
                </div>

                {/* 2. Long Strip: MP3 / Audio Downloader */}
                <div className="liquid-strip-card audio-strip">
                  <div className="strip-header">
                    <div className="strip-title-group">
                      <div className="strip-icon-badge audio-badge">
                        <Music size={14} />
                      </div>
                      <div>
                        <h3 className="strip-title">{isEn ? 'MP3 & Audio Downloader' : 'MP3 & Ses İndirme'}</h3>
                        <p className="strip-desc">{isEn ? 'Extract high quality 320kbps MP3 audio' : 'Yüksek kaliteli 320kbps MP3 ses çıkarıp indirin'}</p>
                      </div>
                    </div>
                    <span className="strip-tag-pill audio-pill">320kbps • FLAC</span>
                  </div>

                  <div className="strip-input-bar">
                    <Link2 size={14} className="strip-input-icon" />
                    <input
                      type="text"
                      className="strip-input-field"
                      placeholder={isEn ? 'Paste link to convert directly to MP3...' : 'Doğrudan MP3 olarak indirmek için link yapıştırın...'}
                      value={audioUrlInput}
                      onChange={(e) => setAudioUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && audioUrlInput.trim()) {
                          setConverterInitialFile('');
                          setConverterInitialUrl(audioUrlInput.trim());
                          setAudioUrlInput('');
                          setShowConverterModal(true);
                        }
                      }}
                    />
                    <button
                      className="liquid-btn-glass-queue"
                      title={isEn ? 'Queue to History without starting' : 'Başlatmadan Geçmiş listesine sıraya ekle'}
                      onClick={() => handleQueueDownload(audioUrlInput, 'music')}
                    >
                      <Clock size={12} />
                      <span>{isEn ? 'Queue' : 'Sıraya Al'}</span>
                    </button>
                    <button
                      className="liquid-btn-emerald"
                      onClick={() => {
                        setConverterInitialFile('');
                        setConverterInitialUrl(audioUrlInput.trim());
                        setAudioUrlInput('');
                        setShowConverterModal(true);
                      }}
                    >
                      <Music size={12} />
                      <span>{isEn ? 'Download MP3' : 'MP3 İndir'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* History Card: Expands upwards to fill all available space */}
              <div className="liquid-card downloaded-files-card">
                <div className="liquid-card-header">
                  <div className="header-left">
                    <button
                      className="liquid-btn-clear-history"
                      title={isEn ? 'Clear completed history' : 'Tamamlanan geçmişi temizle'}
                      onClick={handleClearCompleted}
                    >
                      <Trash2 size={12} />
                      <span>{isEn ? 'Clear' : 'Temizle'}</span>
                    </button>
                    <CheckCircle2 size={16} className="text-emerald" />
                    <h3>{isEn ? 'History' : 'Geçmiş'}</h3>
                    <span className="liquid-badge-counter">{completedDownloads.length}</span>
                  </div>
                  <div className="liquid-search-box">
                    <Search size={12} className="text-muted" />
                    <input
                      type="text"
                      placeholder={isEn ? 'Search files...' : 'Dosya ara...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="liquid-files-scroll">
                  {filteredDownloads.length > 0 ? (
                    filteredDownloads.map((item) => (
                      <div
                        key={item.id}
                        className={`liquid-file-row ${item.id === selectedId ? 'selected' : ''}`}
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => {
                          if (item.status === 'completed') {
                            window.idmApi?.openFile(item.savePath);
                          }
                        }}
                      >
                        <div className="file-cat-icon">
                          {item.category === 'music' ? (
                            <Music size={14} className="text-rose" />
                          ) : (
                            <Film size={14} className="text-sky" />
                          )}
                        </div>

                        <div className="file-meta-col">
                          <span className="file-row-name" title={item.fileName}>
                            {item.fileName}
                          </span>
                          <div className="file-row-sub">
                            <span>{formatBytes(item.totalBytes || item.downloadedBytes, lang)}</span>
                            <span className="sep-bullet">•</span>
                            <span className={`file-status-tag status-${item.status}`}>
                              {item.status === 'completed'
                                ? isEn ? 'Finished' : 'Tamamlandı'
                                : item.status === 'downloading'
                                ? isEn ? 'Downloading' : 'İndiriliyor'
                                : item.status}
                            </span>
                          </div>
                        </div>

                        <div className="file-row-actions">
                          {item.status === 'completed' && (
                            <button
                              className="liquid-action-icon"
                              title={isEn ? 'Open File' : 'Dosyayı Aç'}
                              onClick={(e) => {
                                e.stopPropagation();
                                window.idmApi?.openFile(item.savePath);
                              }}
                            >
                              <ExternalLink size={13} />
                            </button>
                          )}
                          <button
                            className="liquid-action-icon"
                            title={isEn ? 'Show in Finder' : 'Dosyada Aç (Finder)'}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.idmApi?.openFileLocation(item.savePath);
                            }}
                          >
                            <FolderOpen size={13} />
                          </button>
                          <button
                            className="liquid-action-icon danger"
                            title={isEn ? 'Delete' : 'Sil'}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(item.id, false);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="liquid-empty-notice">
                      <CheckCircle2 size={24} className="text-muted" />
                      <span>{isEn ? 'No files found' : 'İndirilen dosya bulunamadı'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Tall Media Sniffer Radar + Slim Bottom Extension Card */}
            <div className="liquid-right-column">
              <div className="liquid-card sniffer-radar-card">
                <div className="liquid-card-header">
                  <div className="header-left">
                    <Radar size={16} className="text-neon-cyan" />
                    <h3>Media Sniffer Radar</h3>
                  </div>
                  <div className="radar-live-tag">
                    <span className="live-pulse-dot" />
                    <span>{sniffedItems.length > 0 ? (isEn ? `${sniffedItems.length} Live Streams` : `${sniffedItems.length} Canlı Akış`) : (isEn ? 'Radar Active' : 'Radar Aktif')}</span>
                  </div>
                </div>

                <div className="sniffer-items-list">
                  {sniffedItems.length > 0 && (
                    <div className="snif-stream-group">
                      <div className="snif-sub-label">{isEn ? 'CAPTURED LIVE STREAMS' : 'YAKALANAN CANLI AKIŞLAR'}</div>
                      {sniffedItems.slice(0, 3).map((sItem) => (
                        <div key={sItem.id} className="snif-row-tile">
                          <div className="snif-tile-icon">
                            {sItem.url.includes('youtube') || sItem.pageUrl.includes('youtube') ? (
                              <span className="badge-yt">YT</span>
                            ) : sItem.url.includes('tiktok') ? (
                              <span className="badge-tt">TT</span>
                            ) : (
                              <Film size={14} />
                            )}
                          </div>
                          <div className="snif-tile-text">
                            <div className="snif-name" title={sItem.pageTitle}>
                              {sItem.pageTitle || (isEn ? 'Live Media Stream' : 'Canlı Medya Akışı')}
                            </div>
                            <div className="snif-spec">
                              {sItem.ext?.toUpperCase() || 'VIDEO'} • {sItem.resolution || (sItem.sizeBytes ? formatBytes(sItem.sizeBytes, lang) : 'Stream')}
                            </div>
                          </div>
                          <button
                            className="liquid-btn-grab"
                            onClick={async () => {
                              const isHls = sItem.ext === 'm3u8' || sItem.url.includes('.m3u8');
                              await handleAddDownload({
                                url: sItem.url,
                                fileName: `${sItem.pageTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${isHls ? 'mp4' : sItem.ext || 'mp4'}`,
                                connectionsCount: 16,
                                sourceType: isHls ? 'hls' : 'direct',
                                headers: sItem.headers,
                                autoStart: true,
                              });
                            }}
                          >
                            Grab
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="snif-stream-group">
                    <div className="snif-sub-label">{isEn ? 'SUPPORTED PLATFORMS' : 'DESTEKLENEN PLATFORMLAR'}</div>
                    
                    {/* 1. YouTube */}
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-yt">YT</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">YouTube</div>
                        <div className="snif-spec">{isEn ? '4K 60fps • HDR • Shorts • Auto Token' : '4K 60fps • HDR • Shorts • Otomatik Token'}</div>
                      </div>
                      <button
                        className="liquid-btn-grab"
                        onClick={() => {
                          setModalInitialUrl('https://www.youtube.com');
                          setShowVideoModal(true);
                        }}
                      >
                        {isEn ? 'Open' : 'Aç'}
                      </button>
                    </div>

                    {/* 2. Instagram */}
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-ig">IG</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">Instagram</div>
                        <div className="snif-spec">{isEn ? 'Reels • Stories • Posts • 1080p' : 'Reels • Hikayeler • Gönderiler • 1080p'}</div>
                      </div>
                      <button
                        className="liquid-btn-grab"
                        onClick={() => {
                          setModalInitialUrl('');
                          setShowVideoModal(true);
                        }}
                      >
                        {isEn ? 'Open' : 'Aç'}
                      </button>
                    </div>

                    {/* 3. TikTok */}
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-tt">TT</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">TikTok</div>
                        <div className="snif-spec">{isEn ? 'Watermark-Free HD • Audio Tracks' : 'Filigransız HD • Ses Parçaları'}</div>
                      </div>
                      <button
                        className="liquid-btn-grab"
                        onClick={() => {
                          setModalInitialUrl('');
                          setShowVideoModal(true);
                        }}
                      >
                        {isEn ? 'Open' : 'Aç'}
                      </button>
                    </div>

                    {/* 4. Twitter / X */}
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-x">𝕏</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">Twitter / 𝕏</div>
                        <div className="snif-spec">{isEn ? 'Max Resolution • GIF & Video' : 'Maksimum Çözünürlük • GIF & Video'}</div>
                      </div>
                      <button
                        className="liquid-btn-grab"
                        onClick={() => {
                          setModalInitialUrl('');
                          setShowVideoModal(true);
                        }}
                      >
                        {isEn ? 'Open' : 'Aç'}
                      </button>
                    </div>

                    {/* 5. SoundCloud */}
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-sc">SC</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">SoundCloud</div>
                        <div className="snif-spec">{isEn ? '320kbps MP3 • Lossless FLAC / WAV' : '320kbps MP3 • Orijinal FLAC / WAV'}</div>
                      </div>
                      <button
                        className="liquid-btn-grab"
                        onClick={() => {
                          setConverterInitialUrl('');
                          setShowConverterModal(true);
                        }}
                      >
                        {isEn ? 'Open' : 'Aç'}
                      </button>
                    </div>

                    {/* 6. Facebook */}
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-fb">FB</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">Facebook</div>
                        <div className="snif-spec">{isEn ? 'Watch Videos • Reels • 1080p' : 'Watch Videoları • Reels • 1080p'}</div>
                      </div>
                      <button
                        className="liquid-btn-grab"
                        onClick={() => {
                          setModalInitialUrl('');
                          setShowVideoModal(true);
                        }}
                      >
                        {isEn ? 'Open' : 'Aç'}
                      </button>
                    </div>

                    {/* 7. Twitch */}
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-tw">TW</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">Twitch</div>
                        <div className="snif-spec">{isEn ? 'Clips • Past Broadcasts 1080p60' : 'Klipler • VOD Geçmiş Yayınlar 1080p60'}</div>
                      </div>
                      <button
                        className="liquid-btn-grab"
                        onClick={() => {
                          setModalInitialUrl('');
                          setShowVideoModal(true);
                        }}
                      >
                        {isEn ? 'Open' : 'Aç'}
                      </button>
                    </div>

                    {/* 8. Vimeo */}
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-vm">VM</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">Vimeo</div>
                        <div className="snif-spec">{isEn ? '4K / 2K Pro Media Streams' : '4K / 2K Pro Medya Akışları'}</div>
                      </div>
                      <button
                        className="liquid-btn-grab"
                        onClick={() => {
                          setModalInitialUrl('');
                          setShowVideoModal(true);
                        }}
                      >
                        {isEn ? 'Open' : 'Aç'}
                      </button>
                    </div>

                    {/* 9. Evrensel Web HLS / M3U8 */}
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-hls">HLS</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">{isEn ? 'All Web Streams (HLS / m3u8)' : 'Tüm Web Siteleri (HLS / m3u8)'}</div>
                        <div className="snif-spec">{isEn ? 'Series / Movie Segment Merger' : 'Dizi / Film / Canlı Yayın Segment Birleştirici'}</div>
                      </div>
                      <button
                        className="liquid-btn-grab"
                        onClick={() => {
                          setShowSnifferModal(true);
                        }}
                      >
                        {isEn ? 'Open' : 'Aç'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Slim Bottom Chrome Extension Bar */}
              <div className="liquid-card extension-square-card">
                <div className="ext-compact-left">
                  <div className="ext-square-icon-wrap">
                    <Globe size={18} className={extensionStatus.isInstalled ? 'text-emerald' : 'text-amber'} />
                  </div>
                  <div>
                    <h4 className="ext-square-title">{isEn ? 'Chrome Extension' : 'Chrome Eklentisi'}</h4>
                    <div className={`ext-status-capsule ${extensionStatus.isInstalled ? 'installed' : 'missing'}`}>
                      <span className="status-dot" />
                      <span>
                        {extensionStatus.isInstalled
                          ? (isEn ? 'INSTALLED' : 'KURULU')
                          : (isEn ? 'NOT INSTALLED' : 'KURULU DEĞİL')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="ext-compact-right">
                  <button
                    className="liquid-btn-ext-install"
                    onClick={handleStartExtensionInstall}
                  >
                    <Zap size={12} />
                    <span>{extensionStatus.isInstalled ? (isEn ? 'Reinstall' : 'Yeniden Kur') : (isEn ? 'Install Extension' : 'Eklentiyi Kur')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Control Bar (Moved to the bottom as requested) */}
          <footer className="liquid-bottom-bar">
            <div className="bottom-left-group">
              <div className="bottom-status-pill">
                <span className={`pulse-dot ${activeDownloads.length > 0 ? 'active' : ''}`} />
                <span>
                  {activeDownloads.length > 0
                    ? `${activeDownloads.length} ${isEn ? 'Active Downloads' : 'İndirme Aktif'}`
                    : (isEn ? 'Ready' : 'Hazır')}
                </span>
              </div>

              <button
                className="liquid-glass-pill"
                onClick={() => setShowSnifferModal(true)}
              >
                <Radar size={13} className="text-neon-cyan" />
                <span>Media Sniffer</span>
                {sniffedItems.length > 0 && (
                  <span className="snif-badge-pill">{sniffedItems.length}</span>
                )}
              </button>
            </div>

            <div className="bottom-center-group">
              <button
                className="liquid-glass-pill"
                title={isEn ? 'Download Queued' : 'Sıraya Alınanları İndir'}
                onClick={() => window.idmApi?.resumeAll().then(setDownloads)}
              >
                <Play size={12} fill="currentColor" />
                <span>{isEn ? 'Download Queued' : 'Sıraya Alınanları İndir'}</span>
              </button>

              <button
                className="liquid-glass-pill"
                title={isEn ? 'Pause All' : 'Hepsini Durdur'}
                onClick={() => window.idmApi?.pauseAll().then(setDownloads)}
              >
                <Pause size={12} fill="currentColor" />
                <span>{isEn ? 'Pause All' : 'Hepsini Durdur'}</span>
              </button>
            </div>

            <div className="bottom-right-group">
              <div className="liquid-speed-capsule">
                <span className="speed-arrow">↓</span>
                <span className="speed-text">
                  {totalActiveSpeed > 0 ? formatSpeed(totalActiveSpeed, lang) : '0.0 KB/s'}
                </span>
              </div>

              {/* Sliding Theme Switcher */}
              <div
                className="liquid-theme-switch-track"
                onClick={toggleTheme}
                title={isDarkMode ? (isEn ? 'Switch to Light Mode' : 'Açık Temaya Geç') : (isEn ? 'Switch to Dark Mode' : 'Koyu Temaya Geç')}
              >
                <div className={`liquid-theme-switch-thumb ${isDarkMode ? 'thumb-dark' : 'thumb-light'}`}>
                  {isDarkMode ? <Moon size={11} className="theme-thumb-icon" /> : <Sun size={11} className="theme-thumb-icon" />}
                </div>
              </div>

              <button
                className="liquid-icon-btn"
                onClick={() => setShowSettingsModal(true)}
                title={isEn ? 'Settings' : 'Ayarlar'}
              >
                <Settings size={15} />
              </button>
            </div>
          </footer>
        </main>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddUrlModal
          initialUrl={modalInitialUrl}
          settings={settings}
          onClose={() => setShowAddModal(false)}
          onProbe={(u, h) =>
            window.idmApi
              ? window.idmApi.probeUrl(u, h)
              : Promise.reject(new Error('No IPC'))
          }
          onSelectDir={() =>
            window.idmApi ? window.idmApi.selectDirectory() : Promise.resolve(null)
          }
          onConfirm={handleAddDownload}
        />
      )}

      {showVideoModal && (
        <VideoGrabberModal
          initialUrl={modalInitialUrl}
          engineStatus={engineStatus}
          ytDlpProgress={ytDlpProgress}
          onClose={() => setShowVideoModal(false)}
          onAnalyze={(u) =>
            window.idmApi
              ? window.idmApi.analyzeVideo(u)
              : Promise.reject(new Error('No IPC'))
          }
          onInstallYtDlp={() => window.idmApi?.installYtDlp()}
          onOpenLiveSniffer={(u) => {
            window.idmApi?.openSnifferBrowser(u);
            setShowSnifferModal(true);
          }}
          onConfirmDownload={handleAddDownload}
        />
      )}

      {showSnifferModal && (
        <SnifferModal
          items={sniffedItems}
          onClose={() => setShowSnifferModal(false)}
          onClear={() => window.idmApi?.clearSniffedItems()}
          onOpenBrowser={(u) => window.idmApi?.openSnifferBrowser(u)}
          onDownloadSniffed={async (item) => {
            const isHls = item.ext === 'm3u8' || item.url.includes('.m3u8');
            const safeName = `${item.pageTitle.replace(/[<>:"/\\|?*]/g, '_')}_${Date.now()}.${
              isHls ? 'mp4' : item.ext || 'mp4'
            }`;
            await handleAddDownload({
              url: item.url,
              fileName: safeName,
              connectionsCount: settings.maxConnectionsPerDownload || 16,
              sourceType: isHls ? 'hls' : 'direct',
              headers: item.headers,
              totalBytes: item.sizeBytes || undefined,
              autoStart: true,
            });
            setShowSnifferModal(false);
          }}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          engineStatus={engineStatus}
          ytDlpProgress={ytDlpProgress}
          onClose={() => setShowSettingsModal(false)}
          onSave={async (partial) => {
            if (window.idmApi) {
              const updated = await window.idmApi.updateSettings(partial);
              setSettings(updated);
            }
          }}
          onSelectDir={() =>
            window.idmApi ? window.idmApi.selectDirectory() : Promise.resolve(null)
          }
          onInstallYtDlp={() => window.idmApi?.installYtDlp()}
        />
      )}

      {showExtensionModal && (
        <ExtensionModal
          language={lang}
          onClose={() => setShowExtensionModal(false)}
          customExtPath={extensionStatus.extensionPath}
          onInstallHelper={handleStartExtensionInstall}
          onOpenExtensionFolder={() =>
            (window.idmApi as any)?.openExtensionFolder
              ? (window.idmApi as any).openExtensionFolder()
              : extensionStatus.extensionPath
              ? window.idmApi?.openFileLocation(
                  extensionStatus.extensionPath + '/manifest.json'
                )
              : undefined
          }
        />
      )}

      {showConverterModal && (
        <ConverterModal
          initialFilePath={converterInitialFile}
          initialUrl={converterInitialUrl}
          onClose={() => setShowConverterModal(false)}
          onSelectFile={() =>
            window.idmApi ? window.idmApi.selectMediaFile() : Promise.resolve(null)
          }
          onAnalyzeUrl={(u) =>
            window.idmApi
              ? window.idmApi.analyzeVideo(u)
              : Promise.reject(new Error('No IPC'))
          }
          onStartUrlConvertDownload={handleAddDownload}
          onConvert={(input, fmt) =>
            window.idmApi
              ? window.idmApi.convertMedia(input, fmt)
              : Promise.reject(new Error('No IPC'))
          }
          onOpenFolder={(p) => window.idmApi?.openFileLocation(p)}
        />
      )}
    </div>
  );
}
export default App;
