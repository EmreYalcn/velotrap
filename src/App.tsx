import React, { useEffect, useMemo, useState } from 'react';
import logoImg from './assets/logo.png';
import {
  Activity,
  Archive,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
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
  Search,
  Settings,
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
  const [appVersion, setAppVersion] = useState('3.1.0');
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

    if ((api as any).getAppVersion) {
      (api as any).getAppVersion().then((v: string) => {
        if (v) setAppVersion(v);
      });
    }

    const checkExt = () => {
      if ((api as any).getExtensionStatus) {
        (api as any).getExtensionStatus().then((status: any) => {
          if (status) {
            setExtensionStatus((prev) => {
              if (!prev.isInstalled && status.isInstalled) {
                setShowCelebration(true);
                setTimeout(() => setShowCelebration(false), 5000);
              }
              return status;
            });
          }
        });
      }
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

  const activeCount = useMemo(
    () =>
      downloads.filter(
        (d) =>
          d.status === 'downloading' ||
          d.status === 'connecting' ||
          d.status === 'merging'
      ).length,
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
    <div className="idm-app-shell">
      {/* Minimal macOS Header */}
      <header className="idm-titlebar">
        <div className="titlebar-brand">
          <img src={logoImg} className="brand-logo-img" alt="Velotrap" />
          <span className="brand-title">Velotrap</span>
          <span className="brand-version">v{appVersion}</span>
        </div>

        <div className="titlebar-telemetry">
          <div className="telemetry-pill">
            <span className={`pulse-dot ${activeCount > 0 ? 'active' : ''}`} />
            <span>
              {activeCount > 0
                ? t(lang, 'activeDownloads', { count: activeCount })
                : t(lang, 'ready')}
            </span>
          </div>
          {totalActiveSpeed > 0 && (
            <div className="telemetry-pill speed-pill">
              <span>{formatSpeed(totalActiveSpeed, lang)}</span>
            </div>
          )}

          <div className="header-nav-btns">
            <button
              className="ghost-nav-btn"
              onClick={() => {
                setConverterInitialUrl(quickUrl.trim());
                setConverterInitialFile(
                  !quickUrl.trim() && selectedItem?.status === 'completed'
                    ? selectedItem.savePath
                    : ''
                );
                setShowConverterModal(true);
              }}
            >
              <Music size={14} />
              <span>{t(lang, 'converter')}</span>
            </button>

            <button
              className="ghost-nav-btn"
              onClick={() => setShowSnifferModal(true)}
            >
              <Radar size={14} />
              <span>{t(lang, 'networkSniffer')}</span>
              {sniffedItems.length > 0 && (
                <b className="count-bubble">{sniffedItems.length}</b>
              )}
            </button>

            <button
              className={`ghost-nav-btn ${!extensionStatus.isInstalled ? 'nav-btn-highlight-warn' : ''}`}
              onClick={() => setShowExtensionModal(true)}
              title={
                extensionStatus.isInstalled
                  ? t(lang, 'extensionConnected')
                  : isEn
                  ? 'Extension Missing - Click to install'
                  : 'Chrome Eklentisi Eksik - Tıklayın'
              }
            >
              <Globe size={14} />
              <span>{t(lang, 'chromeExtension')}</span>
              {extensionStatus.isInstalled ? (
                <span className="dot-active-green" title={t(lang, 'extensionConnected')} />
              ) : (
                <span className="badge-warn-mini">{isEn ? 'Install' : 'Yükle'}</span>
              )}
            </button>

            <button
              className="ghost-nav-btn"
              onClick={() => setShowSettingsModal(true)}
              title={t(lang, 'settings')}
            >
              <Settings size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="idm-workspace">
        {/* Minimal Left Sidebar */}
        <aside className="idm-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-heading">{t(lang, 'categories')}</div>
            {(
              [
                { id: 'all', label: t(lang, 'catAll'), icon: <HardDrive size={14} /> },
                { id: 'video', label: t(lang, 'catVideo'), icon: <Film size={14} /> },
                { id: 'music', label: t(lang, 'catMusic'), icon: <Music size={14} /> },
                { id: 'compressed', label: t(lang, 'catCompressed'), icon: <Archive size={14} /> },
                { id: 'programs', label: t(lang, 'catPrograms'), icon: <Cpu size={14} /> },
                { id: 'documents', label: t(lang, 'catDocuments'), icon: <FileText size={14} /> },
              ] as { id: DownloadCategory; label: string; icon: React.ReactNode }[]
            ).map((cat) => {
              const count =
                cat.id === 'all'
                  ? downloads.length
                  : downloads.filter((d) => d.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  className={`sidebar-item ${categoryFilter === cat.id ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(cat.id)}
                >
                  {cat.icon}
                  <span className="flex-1">{cat.label}</span>
                  {count > 0 && <span className="sidebar-badge">{count}</span>}
                </button>
              );
            })}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-heading">{t(lang, 'statusHeading')}</div>
            <button
              className={`sidebar-item ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              <Download size={14} />
              <span className="flex-1">{t(lang, 'statusAll')}</span>
            </button>
            <button
              className={`sidebar-item ${statusFilter === 'unfinished' ? 'active' : ''}`}
              onClick={() => setStatusFilter('unfinished')}
            >
              <Clock size={14} />
              <span className="flex-1">{t(lang, 'statusUnfinished')}</span>
              <span className="sidebar-badge">
                {downloads.filter((d) => d.status !== 'completed').length}
              </span>
            </button>
            <button
              className={`sidebar-item ${statusFilter === 'finished' ? 'active' : ''}`}
              onClick={() => setStatusFilter('finished')}
            >
              <CheckCircle2 size={14} />
              <span className="flex-1">{t(lang, 'statusFinished')}</span>
              <span className="sidebar-badge">
                {downloads.filter((d) => d.status === 'completed').length}
              </span>
            </button>
          </div>

          {/* Minimal Footer Status */}
          <div className="sidebar-minimal-footer">
            <div className="engine-minimal-row">
              <span className={engineStatus.ytDlpInstalled ? 'dot-ok' : 'dot-warn'} />
              <span>{isEn ? '16x Engine & FFmpeg Ready' : '16x Motor & FFmpeg Hazır'}</span>
            </div>
            {!engineStatus.ytDlpInstalled && (
              <button
                className="btn-sm btn-primary full-width"
                style={{ marginTop: 6 }}
                onClick={handleInstallYtDlp}
              >
                {ytDlpProgress
                  ? `%${ytDlpProgress.pct}`
                  : isEn
                  ? 'Install Engine'
                  : 'Motoru Kur'}
              </button>
            )}
          </div>
        </aside>

        {/* Center Content Area */}
        <main className="idm-main-panel">
          {/* Unified Minimal Command Bar */}
          <div className="quick-action-strip">
            <div className="quick-url-bar">
              <Link2 size={14} className="muted-icon" />
              <input
                type="text"
                className="quick-url-input"
                placeholder={t(lang, 'quickUrlPlaceholder')}
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAction('video');
                }}
              />
              <button
                className="btn-sm btn-primary"
                onClick={() => handleQuickAction('video')}
              >
                <Film size={13} /> {t(lang, 'videoDownload')}
              </button>
              <button
                className="btn-sm btn-emerald"
                onClick={() => handleQuickAction('mp3')}
              >
                <Music size={13} /> {t(lang, 'mp3Download')}
              </button>
              <button
                className="btn-sm btn-secondary"
                onClick={() => handleQuickAction('direct')}
                title={t(lang, 'addUrl')}
              >
                <Plus size={13} /> {isEn ? 'Direct URL' : 'URL'}
              </button>
            </div>

            <div className="search-filter-box">
              <Search size={13} className="muted-icon" />
              <input
                type="text"
                placeholder={t(lang, 'searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="batch-actions-group">
              <button
                className="icon-btn"
                title={t(lang, 'resumeAll')}
                onClick={() => window.idmApi?.resumeAll().then(setDownloads)}
              >
                <RefreshCw size={14} />
              </button>
              <button
                className="icon-btn"
                title={t(lang, 'pauseAll')}
                onClick={() => window.idmApi?.pauseAll().then(setDownloads)}
              >
                <Square size={14} />
              </button>
              {selectedItem && (
                <button
                  className={`icon-btn ${showInspector ? 'active-toggle' : ''}`}
                  title={t(lang, 'toggleInspector')}
                  onClick={() => setShowInspector(!showInspector)}
                >
                  <Activity size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Extension Warning Banner when NOT installed */}
          {!extensionStatus.isInstalled && !bannerDismissed && (
            <div className="extension-banner-box">
              <div className="ext-banner-inner">
                <div className="ext-banner-left">
                  <div className="ext-banner-icon">
                    <Globe size={18} />
                  </div>
                  <div>
                    <div className="ext-banner-title">
                      <strong>{t(lang, 'extBannerTitle')}</strong>
                      <span className="badge-warn-pill">{t(lang, 'extBannerBadge')}</span>
                    </div>
                    <p className="ext-banner-subtitle">
                      {t(lang, 'extBannerDesc')}
                    </p>
                  </div>
                </div>
                <div className="ext-banner-right">
                  <button
                    className="btn-install-ext"
                    onClick={handleStartExtensionInstall}
                  >
                    <Zap size={14} />
                    <span>{t(lang, 'extBannerInstallBtn')}</span>
                  </button>
                  <button
                    className="btn-ext-guide"
                    onClick={() => setShowExtensionModal(true)}
                  >
                    <span>{t(lang, 'extBannerHowTo')}</span>
                  </button>
                  <button
                    className="btn-ext-close"
                    onClick={() => setBannerDismissed(true)}
                    title={t(lang, 'extBannerDismiss')}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {showCelebration && (
            <div className="extension-success-banner">
              <CheckCircle2 size={16} className="text-emerald" />
              <span>{t(lang, 'extSuccessMsg')}</span>
            </div>
          )}

          {/* Main Download Table */}
          <div className="table-scroll-area">
            {filteredDownloads.length === 0 ? (
              <div className="empty-downloads-hero">
                <div className="empty-hero-icon">
                  <Download size={28} />
                </div>
                <h3>{t(lang, 'emptyHeroTitle')}</h3>
                <p>{t(lang, 'emptyHeroDesc')}</p>
              </div>
            ) : (
              <table className="idm-table">
                <thead>
                  <tr>
                    <th style={{ width: '36%' }}>{t(lang, 'colFileName')}</th>
                    <th style={{ width: '12%' }}>{t(lang, 'colSize')}</th>
                    <th style={{ width: '28%' }}>{t(lang, 'colStatus')}</th>
                    <th style={{ width: '12%' }}>{`${t(lang, 'colSpeed')} / ${t(lang, 'colEta')}`}</th>
                    <th style={{ width: '12%', textAlign: 'right' }}>{t(lang, 'colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDownloads.map((item) => {
                    const pct =
                      item.totalBytes > 0
                        ? Math.min(100, (item.downloadedBytes / item.totalBytes) * 100)
                        : item.status === 'completed'
                        ? 100
                        : 0;
                    const isSelected = item.id === selectedId;
                    const isRunning =
                      item.status === 'downloading' ||
                      item.status === 'connecting' ||
                      item.status === 'merging';

                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? 'selected-row' : ''}
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => {
                          if (item.status === 'completed') {
                            window.idmApi?.openFile(item.savePath);
                          }
                        }}
                      >
                        <td>
                          <div className="file-name-cell">
                            {getCategoryIcon(item.category)}
                            <div className="file-name-text">
                              <strong title={item.fileName}>{item.fileName}</strong>
                              <span className="sub-source-badge">
                                {item.videoResolution ||
                                  (item.sourceType === 'yt-dlp'
                                    ? isEn
                                      ? 'Video Stream'
                                      : 'Video Akışı'
                                    : item.sourceType === 'hls'
                                    ? isEn
                                      ? 'HLS Stream'
                                      : 'HLS Akışı'
                                    : isEn
                                    ? `${item.connectionsCount}x Speed`
                                    : `${item.connectionsCount}x Hızlı İndirme`)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="mono-cell">
                          <div>{formatBytes(item.totalBytes, lang)}</div>
                          {item.status !== 'completed' && item.downloadedBytes > 0 && (
                            <div className="sub-bytes">
                              {formatBytes(item.downloadedBytes, lang)}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="progress-cell-wrapper">
                            <div className="progress-top-line">
                              <span className={`status-badge status-${item.status}`}>
                                {getStatusLabel(item.status, pct, lang)}
                              </span>
                              <span className="mono-pct">%{pct.toFixed(0)}</span>
                            </div>
                            <div className="minimal-progress-track">
                              <div
                                className={`minimal-progress-fill seg-${item.status}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {item.errorMessage && (
                              <div className="row-error-text" title={item.errorMessage}>
                                {item.errorMessage}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="mono-cell">
                          {isRunning ? (
                            <>
                              <div className="speed-cell">{formatSpeed(item.speedBps, lang)}</div>
                              <div className="sub-bytes">{formatEta(item.etaSeconds, lang)}</div>
                            </>
                          ) : (
                            <span className="sub-bytes">—</span>
                          )}
                        </td>
                        <td>
                          <div
                            className="row-action-btns"
                            style={{ justifyContent: 'flex-end' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.status === 'completed' ? (
                              <>
                                {item.category === 'video' && (
                                  <button
                                    className="icon-btn"
                                    title={isEn ? 'Convert to MP3' : "MP3'e Dönüştür"}
                                    onClick={() => {
                                      setConverterInitialUrl('');
                                      setConverterInitialFile(item.savePath);
                                      setShowConverterModal(true);
                                    }}
                                  >
                                    <Music size={14} />
                                  </button>
                                )}
                                <button
                                  className="icon-btn"
                                  title={t(lang, 'actionShowInFolder')}
                                  onClick={() =>
                                    window.idmApi?.openFileLocation(item.savePath)
                                  }
                                >
                                  <FolderOpen size={14} />
                                </button>
                              </>
                            ) : isRunning ? (
                              <button
                                className="icon-btn"
                                title={t(lang, 'actionPause')}
                                onClick={() => handlePause(item.id)}
                              >
                                <Pause size={14} />
                              </button>
                            ) : (
                              <button
                                className="icon-btn"
                                title={t(lang, 'actionResume')}
                                onClick={() => handleStart(item.id)}
                              >
                                <Play size={14} />
                              </button>
                            )}
                            <button
                              className="icon-btn danger"
                              title={t(lang, 'actionDelete')}
                              onClick={() => handleDelete(item.id, false)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Collapsible Bottom Inspector */}
          {selectedItem && showInspector && (
            <DownloadInspector
              item={selectedItem}
              settings={settings}
              onClose={() => setShowInspector(false)}
              onStart={handleStart}
              onPause={handlePause}
              onOpenFile={(p) => window.idmApi?.openFile(p)}
              onOpenFolder={(p) => window.idmApi?.openFileLocation(p)}
              onUpdateSpeedLimit={async (kbps) => {
                if (window.idmApi) {
                  const updated = await window.idmApi.updateSettings({
                    speedLimitKbps: kbps,
                  });
                  setSettings(updated);
                }
              }}
            />
          )}
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
