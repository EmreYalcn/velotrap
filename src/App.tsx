import React, { useEffect, useMemo, useState } from 'react';
import logoImg from './assets/logo.png';
import {
  Activity,
  Archive,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  FileText,
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
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  AppLanguage,
  ClipRange,
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
import { DownloadInspector } from './components/DownloadInspector';
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
  const [appVersion, setAppVersion] = useState('3.1.14');
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<DownloadCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unfinished' | 'finished'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickUrl, setQuickUrl] = useState('');

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
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

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
          setExtensionStatus((prev) => {
            const nowInstalled = data.extensionInstalled || false;
            if (!prev.isInstalled && nowInstalled) {
              setShowCelebration(true);
              setTimeout(() => setShowCelebration(false), 5000);
            }
            return {
              isInstalled: nowInstalled,
              version: data.extensionVersion || '1.2.0',
              lastSeenAt: data.lastExtensionPing || Date.now(),
              extensionPath: data.extensionPath || '',
            };
          });
        }
      } catch {}
    };

    checkExt();
    const extInterval = setInterval(checkExt, 3500);

    const unsubExt = (api as any).onExtensionStatusUpdated
      ? (api as any).onExtensionStatusUpdated((status: any) => {
          if (status) {
            setExtensionStatus((prev) => {
              if (!prev.isInstalled && status.isInstalled) {
                setShowCelebration(true);
                setTimeout(() => setShowCelebration(false), 5000);
              }
              return status;
            });
          }
        })
      : () => {};

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
      unsubExt();
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

  const activeCount = activeDownloads.length;
  const completedCount = completedDownloads.length;

  // Active Hero item: prefer selected item if downloading, or the first active download, or first item
  const heroDownload = useMemo(() => {
    if (selectedItem && (selectedItem.status === 'downloading' || selectedItem.status === 'connecting')) {
      return selectedItem;
    }
    return activeDownloads[0] || downloads[0] || null;
  }, [selectedItem, activeDownloads, downloads]);

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
    clipRange?: ClipRange;
  }) => {
    if (!window.idmApi) return;
    const created = await window.idmApi.addDownload(options);
    setSelectedId(created.id);
  };

  const handleQuickAction = async (mode: 'direct' | 'video' | 'mp3') => {
    const clean = quickUrl.trim();
    if (!clean) {
      setModalInitialUrl('');
      setConverterInitialUrl('');
      setConverterInitialFile('');
      if (mode === 'video') setShowVideoModal(true);
      else if (mode === 'mp3') setShowConverterModal(true);
      else setShowAddModal(true);
      return;
    }

    setQuickUrl('');
    if (mode === 'mp3') {
      setConverterInitialFile('');
      setConverterInitialUrl(clean);
      setShowConverterModal(true);
    } else if (mode === 'video') {
      setModalInitialUrl(clean);
      setShowVideoModal(true);
    } else {
      setModalInitialUrl(clean);
      setShowAddModal(true);
    }
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

  const handleDelete = async (id: string, deleteDisk = false) => {
    if (window.idmApi) {
      const updated = await window.idmApi.deleteDownload(id, deleteDisk);
      setDownloads(updated);
      if (selectedId === id) {
        setSelectedId(updated[0]?.id || null);
      }
    }
  };

  const handleInstallYtDlp = async () => {
    if (!window.idmApi) return;
    const res = await window.idmApi.installYtDlp();
    setEngineStatus(res.status);
    setYtDlpProgress(null);
  };

  const getCategoryIcon = (cat: Exclude<DownloadCategory, 'all'>) => {
    switch (cat) {
      case 'video':
        return <Film size={15} className="cat-icon-video" />;
      case 'music':
        return <Music size={15} className="cat-icon-music" />;
      case 'compressed':
        return <Archive size={15} className="cat-icon-compressed" />;
      case 'programs':
        return <Cpu size={15} className="cat-icon-programs" />;
      case 'documents':
        return <FileText size={15} className="cat-icon-documents" />;
    }
  };

  return (
    <div className="idm-app-shell visionos-spatial-theme">
      {/* Background Cosmic Canvas */}
      <div className="visionos-cosmos-bg" />

      {/* Main Glass Shell Container */}
      <div className="visionos-window">
        {/* Left Frosted Sidebar */}
        <aside className="visionos-sidebar">
          {/* macOS Traffic Lights + Add URL Pill */}
          <div className="visionos-traffic-bar">
            <div className="traffic-lights">
              <span className="tl-dot tl-red" />
              <span className="tl-dot tl-yellow" />
              <span className="tl-dot tl-green" />
            </div>
            <button
              className="visionos-btn-add-url"
              onClick={() => {
                setModalInitialUrl('');
                setShowAddModal(true);
              }}
            >
              <Plus size={13} />
              <span>{isEn ? '+ Add URL' : '+ Link Ekle'}</span>
            </button>
          </div>

          {/* Navigation Section */}
          <div className="visionos-nav-group">
            <button
              className={`visionos-nav-item ${statusFilter === 'all' && categoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => {
                setStatusFilter('all');
                setCategoryFilter('all');
              }}
            >
              <HardDrive size={15} />
              <span className="nav-title">{isEn ? 'All Downloads' : 'Tüm Dosyalar'}</span>
              <span className="nav-count">({downloads.length})</span>
            </button>

            <button
              className={`visionos-nav-item ${statusFilter === 'unfinished' ? 'active' : ''}`}
              onClick={() => setStatusFilter('unfinished')}
            >
              <div className="nav-icon-glow">
                <span className="pulse-blue-dot" />
              </div>
              <span className="nav-title">{isEn ? 'Active' : 'İndiriliyor'}</span>
              <span className="nav-count">({activeCount})</span>
            </button>

            <button
              className={`visionos-nav-item ${statusFilter === 'finished' ? 'active' : ''}`}
              onClick={() => setStatusFilter('finished')}
            >
              <CheckCircle2 size={15} className="text-emerald" />
              <span className="nav-title">{isEn ? 'Completed' : 'Tamamlanan'}</span>
              <span className="nav-count">({completedCount})</span>
            </button>
          </div>

          {/* Categories Section */}
          <div className="visionos-divider" />
          <div className="visionos-nav-group">
            <div className="visionos-section-label">{isEn ? 'CATEGORIES' : 'KATEGORİLER'}</div>
            {(
              [
                { id: 'video', label: isEn ? 'Videos' : 'Videolar', icon: <Film size={14} /> },
                { id: 'music', label: isEn ? 'Audio' : 'Müzik & Ses', icon: <Music size={14} /> },
                { id: 'compressed', label: isEn ? 'Archives' : 'Arşivler', icon: <Archive size={14} /> },
                { id: 'programs', label: isEn ? 'Apps' : 'Programlar', icon: <Cpu size={14} /> },
              ] as { id: DownloadCategory; label: string; icon: React.ReactNode }[]
            ).map((cat) => {
              const count = downloads.filter((d) => d.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  className={`visionos-nav-item ${categoryFilter === cat.id ? 'active' : ''}`}
                  onClick={() => {
                    setCategoryFilter(cat.id);
                    setStatusFilter('all');
                  }}
                >
                  {cat.icon}
                  <span className="nav-title">{cat.label}</span>
                  <span className="nav-count">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Sidebar Disk Space / Engine Status Footer */}
          <div className="visionos-sidebar-bottom">
            <div className="disk-storage-pill">
              <HardDrive size={13} className="text-muted" />
              <div className="disk-meta">
                <span className="disk-label">Macintosh HD</span>
                <span className="disk-free">
                  {isEn ? 'High Speed Engine 16x' : '16x Hızlı Motor Hazır'}
                </span>
              </div>
            </div>
            {!engineStatus.ytDlpInstalled && (
              <button
                className="visionos-mini-action-btn"
                onClick={handleInstallYtDlp}
              >
                {ytDlpProgress ? `%${ytDlpProgress.pct}` : isEn ? 'Install Engine' : 'Motoru Kur'}
              </button>
            )}
          </div>
        </aside>

        {/* Right Main Spatial Bento Canvas */}
        <main className="visionos-main-stage">
          {/* Top Spatial Command Header Bar */}
          <header className="visionos-topbar">
            {/* Quick URL Grab / Paste Input */}
            <div className="visionos-url-bar">
              <Link2 size={15} className="url-link-icon" />
              <input
                type="text"
                className="visionos-url-input"
                placeholder={isEn ? 'Paste video, audio or file URL to download (⌘V)...' : 'İndirmek istediğiniz video, müzik veya dosya bağlantısını yapıştırın (⌘V)...'}
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAction('video');
                }}
              />
              <button
                className="visionos-pill-btn-neon"
                onClick={() => handleQuickAction('video')}
              >
                <Zap size={13} />
                <span>{isEn ? 'Download' : 'İndir'}</span>
              </button>
              <button
                className="visionos-pill-btn-glass"
                onClick={() => {
                  setConverterInitialFile('');
                  setConverterInitialUrl(quickUrl.trim());
                  setShowConverterModal(true);
                }}
                title={isEn ? 'Clip or Convert to MP3' : 'Kırp veya MP3 Yap'}
              >
                <Scissors size={13} />
                <span>{isEn ? 'Clip' : 'Kırp'}</span>
              </button>
            </div>

            {/* Quick Utility Actions */}
            <div className="visionos-top-actions">
              <button
                className="visionos-glass-action"
                onClick={() => setShowSnifferModal(true)}
              >
                <Radar size={14} className="text-neon-cyan" />
                <span>Media Sniffer</span>
                {sniffedItems.length > 0 && (
                  <span className="snif-badge-pill">{sniffedItems.length}</span>
                )}
              </button>

              <button
                className="visionos-glass-action"
                title={isEn ? 'Resume All' : 'Hepsini Başlat'}
                onClick={() => window.idmApi?.resumeAll().then(setDownloads)}
              >
                <Play size={12} fill="currentColor" />
                <span>{isEn ? 'Resume' : 'Devam'}</span>
              </button>

              <button
                className="visionos-glass-action"
                title={isEn ? 'Pause All' : 'Hepsini Durdur'}
                onClick={() => window.idmApi?.pauseAll().then(setDownloads)}
              >
                <Pause size={12} fill="currentColor" />
                <span>{isEn ? 'Pause' : 'Durdur'}</span>
              </button>

              {/* Live Speed Glow Pill */}
              <div className="visionos-speed-neon-pill">
                <span className="speed-arrow">↓</span>
                <span className="speed-val">
                  {totalActiveSpeed > 0 ? formatSpeed(totalActiveSpeed, lang) : '0.0 KB/s'}
                </span>
              </div>

              {/* Settings Cog */}
              <button
                className="visionos-icon-btn"
                onClick={() => setShowSettingsModal(true)}
                title={isEn ? 'Settings' : 'Ayarlar'}
              >
                <Settings size={15} />
              </button>
            </div>
          </header>

          {/* Bento Content Area */}
          <div className="visionos-bento-grid">
            {/* 1. Hero Active Download Bento Card (Top Left) */}
            <section className="bento-card bento-hero-active">
              {heroDownload ? (
                (() => {
                  const item = heroDownload;
                  const pct =
                    item.totalBytes > 0
                      ? Math.min(100, (item.downloadedBytes / item.totalBytes) * 100)
                      : item.status === 'completed'
                      ? 100
                      : 0;
                  const isRunning =
                    item.status === 'downloading' ||
                    item.status === 'connecting' ||
                    item.status === 'merging';
                  const totalChunks = 16;
                  const activeChunks = Math.max(
                    1,
                    Math.round((pct / 100) * totalChunks)
                  );

                  return (
                    <div className="bento-hero-inner">
                      {/* Video Poster & Title Overlay */}
                      <div className="hero-poster-header">
                        <div className="hero-header-meta">
                          <h2 className="hero-file-name" title={item.fileName}>
                            {item.fileName}
                          </h2>
                          <div className="hero-format-pills">
                            <span className="hero-badge-tag">
                              {item.videoResolution || (item.category === 'video' ? '4K 60fps' : '16x Multi-Chunk')}
                            </span>
                            <span className="hero-badge-tag-secondary">
                              {item.category.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Top Right Quick Actions inside Hero */}
                        <div className="hero-quick-btns">
                          {isRunning ? (
                            <button
                              className="hero-action-circle"
                              title={isEn ? 'Pause' : 'Durdur'}
                              onClick={() => handlePause(item.id)}
                            >
                              <Pause size={15} />
                            </button>
                          ) : (
                            <button
                              className="hero-action-circle"
                              title={isEn ? 'Start' : 'Başlat'}
                              onClick={() => handleStart(item.id)}
                            >
                              <Play size={15} />
                            </button>
                          )}
                          <button
                            className="hero-action-circle"
                            title={isEn ? 'Open Folder' : 'Klasörde Aç'}
                            onClick={() => window.idmApi?.openFileLocation(item.savePath)}
                          >
                            <FolderOpen size={15} />
                          </button>
                          <button
                            className="hero-action-circle"
                            title={isEn ? 'Clip or Convert' : 'Kırp & Dönüştür'}
                            onClick={() => {
                              setConverterInitialFile(item.savePath);
                              setShowConverterModal(true);
                            }}
                          >
                            <Scissors size={15} />
                          </button>
                          <button
                            className="hero-action-circle danger"
                            title={isEn ? 'Delete' : 'Sil'}
                            onClick={() => handleDelete(item.id, false)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* 16-Segment Parallel Visual Segment Bar */}
                      <div className="hero-chunk-deck">
                        <div className="chunk-segments-row">
                          {Array.from({ length: totalChunks }).map((_, idx) => (
                            <div
                              key={idx}
                              className={`chunk-bar-block ${idx < activeChunks ? 'filled' : 'empty'} ${idx === activeChunks - 1 && isRunning ? 'active-pulse' : ''}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Download Stats + Video Clipper Tag */}
                      <div className="hero-stats-footer">
                        <div className="hero-meta-bytes">
                          <span className="bytes-downloaded">
                            {formatBytes(item.downloadedBytes, lang)}
                          </span>
                          <span className="bytes-divider">/</span>
                          <span className="bytes-total">
                            {formatBytes(item.totalBytes, lang)}
                          </span>
                          <span className="stat-bullet">•</span>
                          <span className="stat-pct">%{pct.toFixed(0)}</span>
                          <span className="stat-bullet">•</span>
                          <span className="stat-speed">
                            {item.speedBps ? formatSpeed(item.speedBps, lang) : '0 KB/s'}
                          </span>
                          <span className="stat-bullet">•</span>
                          <span className="stat-eta">
                            ETA {item.etaSeconds ? formatEta(item.etaSeconds, lang) : '--:--'}
                          </span>
                        </div>

                        <div className="hero-clipper-tag">
                          <Scissors size={12} />
                          <span>01:20 - 05:40</span>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="hero-empty-state">
                  <Film size={36} className="text-muted" />
                  <h3>{isEn ? 'No Active Download' : 'Aktif İndirme Yok'}</h3>
                  <p>{isEn ? 'Paste any link above or catch streams from your browser.' : 'Yukarıdaki alana link yapıştırın veya tarayıcınızdan yakalayın.'}</p>
                </div>
              )}
            </section>

            {/* 2. Media Sniffer Radar Card (Top Right) */}
            <section className="bento-card bento-sniffer-radar">
              <div className="card-top-header">
                <div className="header-title-row">
                  <Radar size={16} className="text-neon-cyan" />
                  <h3>Media Sniffer Radar</h3>
                </div>
                <div className="radar-live-tag">
                  <span className="live-pulse-dot" />
                  <span>Live</span>
                </div>
              </div>

              <div className="sniffer-items-list">
                {sniffedItems.length > 0 ? (
                  sniffedItems.slice(0, 4).map((sItem) => (
                    <div key={sItem.id} className="snif-row-tile">
                      <div className="snif-tile-icon">
                        {sItem.url.includes('youtube') || sItem.pageUrl.includes('youtube') ? (
                          <span className="badge-yt">YT</span>
                        ) : sItem.url.includes('tiktok') ? (
                          <span className="badge-tt">TT</span>
                        ) : (
                          <Film size={15} />
                        )}
                      </div>
                      <div className="snif-tile-text">
                        <div className="snif-name" title={sItem.pageTitle}>
                          {sItem.pageTitle || 'Canlı Medya Akışı'}
                        </div>
                        <div className="snif-spec">
                          {sItem.ext?.toUpperCase() || 'VIDEO'} • {sItem.resolution || (sItem.sizeBytes ? formatBytes(sItem.sizeBytes, lang) : 'Stream')}
                        </div>
                      </div>
                      <button
                        className="btn-grab-neon"
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
                  ))
                ) : (
                  <>
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-yt">YT</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">YouTube</div>
                        <div className="snif-spec">4K 60fps • Otomatik</div>
                      </div>
                      <button
                        className="btn-grab-neon"
                        onClick={() => {
                          setModalInitialUrl('https://www.youtube.com');
                          setShowVideoModal(true);
                        }}
                      >
                        Grab
                      </button>
                    </div>
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-tt">TT</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">TikTok / Reels</div>
                        <div className="snif-spec">1080p • Filigransız</div>
                      </div>
                      <button
                        className="btn-grab-neon"
                        onClick={() => {
                          setModalInitialUrl('');
                          setShowVideoModal(true);
                        }}
                      >
                        Grab
                      </button>
                    </div>
                    <div className="snif-row-tile">
                      <div className="snif-tile-icon badge-sc">SC</div>
                      <div className="snif-tile-text">
                        <div className="snif-name">SoundCloud / X</div>
                        <div className="snif-spec">FLAC / MP3 • Canlı</div>
                      </div>
                      <button
                        className="btn-grab-neon"
                        onClick={() => {
                          setConverterInitialUrl('');
                          setShowConverterModal(true);
                        }}
                      >
                        Grab
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* 3. Downloaded Files List Card (Bottom Left) */}
            <section className="bento-card bento-completed-files">
              <div className="card-top-header">
                <div className="header-title-row">
                  <CheckCircle2 size={16} className="text-emerald" />
                  <h3>{isEn ? 'Downloaded Files' : 'İndirilen Dosyalar'}</h3>
                  <span className="bento-count-badge">{completedDownloads.length}</span>
                </div>
                <div className="bento-header-filter">
                  <Search size={12} className="text-muted" />
                  <input
                    type="text"
                    placeholder={isEn ? 'Filter files...' : 'Dosya ara...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="completed-items-scroll">
                {filteredDownloads.length > 0 ? (
                  filteredDownloads.map((item) => (
                    <div
                      key={item.id}
                      className={`completed-row-tile ${item.id === selectedId ? 'selected' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                      onDoubleClick={() => {
                        if (item.status === 'completed') {
                          window.idmApi?.openFile(item.savePath);
                        }
                      }}
                    >
                      <div className="tile-category-icon">
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="tile-info-block">
                        <div className="tile-name" title={item.fileName}>
                          {item.fileName}
                        </div>
                        <div className="tile-submeta">
                          <span>{formatBytes(item.totalBytes || item.downloadedBytes, lang)}</span>
                          <span className="dot-sep">•</span>
                          <span className={`item-status-pill status-${item.status}`}>
                            {item.status === 'completed'
                              ? isEn ? 'Finished' : 'Tamamlandı'
                              : item.status === 'downloading'
                              ? isEn ? 'Downloading' : 'İndiriliyor'
                              : item.status}
                          </span>
                        </div>
                      </div>

                      {/* File Actions: Open in Folder & Delete */}
                      <div className="tile-actions">
                        {item.status === 'completed' && (
                          <button
                            className="tile-btn"
                            title={isEn ? 'Open File' : 'Dosyayı Aç'}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.idmApi?.openFile(item.savePath);
                            }}
                          >
                            <ExternalLink size={14} />
                          </button>
                        )}
                        <button
                          className="tile-btn"
                          title={isEn ? 'Show in Finder' : 'Dosyada Aç (Finder)'}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.idmApi?.openFileLocation(item.savePath);
                          }}
                        >
                          <FolderOpen size={14} />
                        </button>
                        <button
                          className="tile-btn danger"
                          title={isEn ? 'Delete' : 'Sil'}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id, false);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bento-no-files">
                    <CheckCircle2 size={24} className="text-muted" />
                    <span>{isEn ? 'No downloads found' : 'İndirilen dosya bulunamadı'}</span>
                  </div>
                )}
              </div>
            </section>

            {/* 4. Chrome Extension & Engine Status Bento Card (Bottom Right) */}
            <section className="bento-card bento-extension-status">
              <div className="card-top-header">
                <div className="header-title-row">
                  <Globe size={16} className={extensionStatus.isInstalled ? 'text-emerald' : 'text-amber'} />
                  <h3>{isEn ? 'Chrome Extension' : 'Chrome Eklentisi'}</h3>
                </div>
                <div className={`ext-status-pill ${extensionStatus.isInstalled ? 'connected' : 'missing'}`}>
                  <span className="status-dot" />
                  <span>
                    {extensionStatus.isInstalled
                      ? isEn ? 'CONNECTED' : 'BAĞLI'
                      : isEn ? 'NOT CONNECTED' : 'KURULU DEĞİL'}
                  </span>
                </div>
              </div>

              <div className="ext-card-body">
                <div className="ext-info-row">
                  <span className="ext-key">Bridge IP:</span>
                  <span className="ext-val">127.0.0.1:46890</span>
                </div>
                <div className="ext-info-row">
                  <span className="ext-key">Versiyon:</span>
                  <span className="ext-val">{extensionStatus.version || 'v1.2.0'}</span>
                </div>
                <div className="ext-info-row">
                  <span className="ext-key">Durum:</span>
                  <span className="ext-val text-emerald">
                    {extensionStatus.isInstalled
                      ? (isEn ? 'Ready for auto capture ✓' : 'Otomatik Yakalamaya Hazır ✓')
                      : (isEn ? 'Click below to enable' : 'Aktif etmek için tıklayın')}
                  </span>
                </div>

                <div className="ext-card-actions">
                  <button
                    className="btn-visionos-ext-action"
                    onClick={handleStartExtensionInstall}
                  >
                    <Zap size={14} />
                    <span>{extensionStatus.isInstalled ? (isEn ? 'Re-install' : 'Yeniden Kur') : (isEn ? 'Install Extension' : 'Eklentiyi Kur')}</span>
                  </button>
                  <button
                    className="btn-visionos-ext-guide"
                    onClick={() => setShowExtensionModal(true)}
                  >
                    {isEn ? 'Guide' : 'Rehber'}
                  </button>
                </div>
              </div>
            </section>
          </div>
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
          onInstallYtDlp={handleInstallYtDlp}
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
          onInstallYtDlp={handleInstallYtDlp}
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
