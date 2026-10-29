import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  Languages,
  Link2,
  Loader2,
  Music,
  Plus,
  Radar,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  AppLanguage,
  EngineSettings,
  EngineStatus,
  ProbeResult,
  SniffedMediaItem,
  VideoAnalysisResult,
} from '../types/idm';
import { formatBytes, formatDuration, getCategoryLabel } from '../utils/formatters';

interface AddUrlModalProps {
  initialUrl?: string;
  settings: EngineSettings;
  onClose: () => void;
  onProbe: (url: string, headers?: Record<string, string>) => Promise<ProbeResult>;
  onSelectDir: () => Promise<string | null>;
  onConfirm: (options: {
    url: string;
    fileName?: string;
    saveDir?: string;
    connectionsCount?: number;
    headers?: Record<string, string>;
    autoStart?: boolean;
  }) => Promise<void>;
}

const SAMPLE_FILES = [
  {
    label: '158 MB 1080p MP4 Video (16x Hız Testi)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    label: '129 MB HD Sintel Film (Çoklu Parça Testi)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
  {
    label: '15 MB ForBiggerBlazes MP4 (Hızlı Test)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
];

export const AddUrlModal: React.FC<AddUrlModalProps> = ({
  initialUrl = '',
  settings,
  onClose,
  onProbe,
  onSelectDir,
  onConfirm,
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [fileName, setFileName] = useState('');
  const [saveDir, setSaveDir] = useState(settings.downloadDir);
  const [connectionsCount, setConnectionsCount] = useState(
    settings.maxConnectionsPerDownload || 16
  );
  const [referer, setReferer] = useState('');
  const [cookie, setCookie] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeInfo, setProbeInfo] = useState<ProbeResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const runProbe = async (targetUrl: string) => {
    const clean = targetUrl.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return;
    setProbing(true);
    try {
      const headers: Record<string, string> = {};
      if (referer.trim()) headers['Referer'] = referer.trim();
      if (cookie.trim()) headers['Cookie'] = cookie.trim();
      const info = await onProbe(clean, headers);
      setProbeInfo(info);
      setFileName(info.fileName);
    } catch {
      setProbeInfo(null);
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    if (initialUrl) {
      runProbe(initialUrl);
    }
  }, [initialUrl]);

  const handleSubmit = async (autoStart: boolean) => {
    if (!url.trim()) return;
    const headers: Record<string, string> = {};
    if (referer.trim()) headers['Referer'] = referer.trim();
    if (cookie.trim()) headers['Cookie'] = cookie.trim();

    await onConfirm({
      url: url.trim(),
      fileName: fileName.trim() || undefined,
      saveDir,
      connectionsCount,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      autoStart,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-blue">
              <Link2 size={18} />
            </div>
            <div>
              <h3>Yeni İndirme Ekle (IDM Çoklu Parça Hızlandırıcı)</h3>
              <p className="modal-subtitle">
                HTTP, HTTPS veya HLS (.m3u8) adresini girin ve 32 kanala kadar bölerek indirin
              </p>
            </div>
          </div>
          <button className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="field-label">İndirme Adresi (URL):</label>
            <div className="input-with-btn">
              <input
                type="text"
                className="idm-input flex-1"
                placeholder="https://ornek.com/dosya.zip veya video.mp4"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => runProbe(url)}
              />
              <button
                className="btn-secondary"
                disabled={probing || !url.trim()}
                onClick={() => runProbe(url)}
              >
                {probing ? <Loader2 size={14} className="spin" /> : 'Bilgi Al'}
              </button>
            </div>
          </div>

          <div className="sample-chips-row">
            <span className="sample-label">Hızlı Test Dosyaları:</span>
            {SAMPLE_FILES.map((s, idx) => (
              <button
                key={idx}
                className="sample-chip"
                onClick={() => {
                  setUrl(s.url);
                  runProbe(s.url);
                }}
              >
                <Zap size={12} /> {s.label}
              </button>
            ))}
          </div>

          {probeInfo && (
            <div className="probe-summary-banner">
              <div>
                <span className="probe-badge">{getCategoryLabel(probeInfo.category)}</span>
                <strong>{formatBytes(probeInfo.totalBytes)}</strong>
              </div>
              <span className={probeInfo.resumable ? 'text-yes' : 'text-no'}>
                {probeInfo.resumable
                  ? '✓ Çoklu Parça & Duraklatma Destekleniyor'
                  : 'Tek Kanal Akış'}
              </span>
            </div>
          )}

          <div className="form-row-2col">
            <div className="form-group">
              <label className="field-label">Dosya Adı:</label>
              <input
                type="text"
                className="idm-input"
                placeholder="Otomatik algılanacak"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="field-label">Paralel Bağlantı (Kanal) Sayısı:</label>
              <select
                className="idm-select full-width"
                value={connectionsCount}
                onChange={(e) => setConnectionsCount(Number(e.target.value))}
              >
                <option value={1}>1 Kanal (Standart)</option>
                <option value={4}>4 Kanal</option>
                <option value={8}>8 Kanal (IDM Standart)</option>
                <option value={16}>16 Kanal (Yüksek Hız)</option>
                <option value={32}>32 Kanal (Maksimum Hızlandırma)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="field-label">Kayıt Klasörü:</label>
            <div className="input-with-btn">
              <input
                type="text"
                className="idm-input flex-1"
                value={saveDir}
                onChange={(e) => setSaveDir(e.target.value)}
              />
              <button
                className="btn-secondary"
                onClick={async () => {
                  const chosen = await onSelectDir();
                  if (chosen) setSaveDir(chosen);
                }}
              >
                <FolderOpen size={14} /> Gözat
              </button>
            </div>
          </div>

          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              className="link-toggle-btn"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced
                ? '▲ Gelişmiş HTTP Başlıklarını Gizle (Referer / Cookie)'
                : '▼ Gelişmiş HTTP Başlıkları Ekle (Korumalı Siteler İçin Referer / Cookie)'}
            </button>
          </div>

          {showAdvanced && (
            <div className="form-row-2col" style={{ marginTop: 8 }}>
              <div className="form-group">
                <label className="field-label">Referer (Kaynak Sayfa):</label>
                <input
                  type="text"
                  className="idm-input"
                  placeholder="https://site.com/video-sayfasi"
                  value={referer}
                  onChange={(e) => setReferer(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="field-label">Oturum Çerezi (Cookie):</label>
                <input
                  type="text"
                  className="idm-input"
                  placeholder="session_id=..."
                  value={cookie}
                  onChange={(e) => setCookie(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => handleSubmit(false)}>
            Daha Sonra İndir (Kuyruğa Ekle)
          </button>
          <div className="footer-right">
            <button className="btn-secondary" onClick={onClose}>
              İptal
            </button>
            <button
              className="btn-primary"
              disabled={!url.trim()}
              onClick={() => handleSubmit(true)}
            >
              <Zap size={15} /> İndirmeyi Şimdi Başlat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SnifferModalProps {
  items: SniffedMediaItem[];
  onClose: () => void;
  onClear: () => void;
  onOpenBrowser: (url: string) => void;
  onDownloadSniffed: (item: SniffedMediaItem) => void;
}

export const SnifferModal: React.FC<SnifferModalProps> = ({
  items,
  onClose,
  onClear,
  onOpenBrowser,
  onDownloadSniffed,
}) => {
  const [targetSite, setTargetSite] = useState('https://');

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-lg">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-emerald">
              <Radar size={18} />
            </div>
            <div>
              <h3>IDM Canlı Ağ Video Yakalayıcı (Web Stream Sniffer)</h3>
              <p className="modal-subtitle">
                Herhangi bir web sitesini dahili yakalayıcıda açın; videoyu oynattığınız anda gizli
                .m3u8 ve .mp4 akışları Cookie/Referer bilgileriyle burada listelenir!
              </p>
            </div>
          </div>
          <button className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="video-search-box">
            <Globe size={16} className="input-prefix-icon" />
            <input
              type="text"
              className="idm-input flex-1"
              placeholder="Videosunu yakalamak istediğiniz site adresini yazın (örn: https://vimeo.com veya herhangi bir film/dizi/kurs sitesi)"
              value={targetSite}
              onChange={(e) => setTargetSite(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onOpenBrowser(targetSite)}
            />
            <button
              className="btn-primary"
              onClick={() => onOpenBrowser(targetSite)}
            >
              <ExternalLink size={15} /> Siteyi Yakalayıcı Tarayıcıda Aç
            </button>
          </div>

          <div className="sniffer-list-header">
            <span>Yakalanan Medya Akışları ({items.length})</span>
            {items.length > 0 && (
              <button className="btn-sm btn-secondary" onClick={onClear}>
                <Trash2 size={13} /> Listeyi Temizle
              </button>
            )}
          </div>

          <div className="sniffer-table-container">
            {items.length === 0 ? (
              <div className="empty-sniffer-state">
                <Radar size={36} className="pulse-icon" />
                <h4>Henüz Ağ Trafiğinden Video Yakalanmadı</h4>
                <p>
                  Yukarıdan bir web sitesi açın ve sayfadaki videoyu başlatın. Velotrap ağ
                  katmanındaki tüm <code>.m3u8</code>, <code>.mp4</code>, <code>.webm</code>{' '}
                  akışlarını otomatik yakalayacaktır.
                </p>
              </div>
            ) : (
              <table className="idm-table">
                <thead>
                  <tr>
                    <th>Sayfa / Başlık</th>
                    <th>Tür</th>
                    <th>Boyut / Akış</th>
                    <th>Yakalanan Akış URL</th>
                    <th style={{ width: 130 }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.pageTitle}</strong>
                      </td>
                      <td>
                        <span className="ext-tag">{item.ext.toUpperCase()}</span>
                      </td>
                      <td>
                        {item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : item.resolution}
                      </td>
                      <td className="url-cell" title={item.url}>
                        {item.url}
                      </td>
                      <td>
                        <button
                          className="btn-sm btn-primary"
                          onClick={() => onDownloadSniffed(item)}
                        >
                          <Download size={13} /> IDM ile İndir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <span className="muted-sub">
            İpucu: Chrome/Brave eklentisi için proje klasöründeki{' '}
            <code>browser-extension</code> dizinini tarayıcınıza yükleyebilirsiniz.
          </span>
          <button className="btn-secondary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  settings: EngineSettings;
  engineStatus: EngineStatus;
  ytDlpProgress: { pct: number; statusText: string } | null;
  onClose: () => void;
  onSave: (partial: Partial<EngineSettings>) => Promise<void>;
  onSelectDir: () => Promise<string | null>;
  onInstallYtDlp: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  engineStatus,
  ytDlpProgress,
  onClose,
  onSave,
  onSelectDir,
  onInstallYtDlp,
}) => {
  const [downloadDir, setDownloadDir] = useState(settings.downloadDir);
  const [maxConnectionsPerDownload, setMaxConnectionsPerDownload] = useState(
    settings.maxConnectionsPerDownload
  );
  const [speedLimitKbps, setSpeedLimitKbps] = useState(settings.speedLimitKbps);
  const [autoStartDownloads, setAutoStartDownloads] = useState(
    settings.autoStartDownloads
  );
  const [language, setLanguage] = useState<AppLanguage>(settings.language || 'tr');
  const [youtubeAntiBot, setYoutubeAntiBot] = useState(
    settings.youtubeAntiBot !== false
  );
  const [youtubeBrowserCookies, setYoutubeBrowserCookies] = useState<string>(
    settings.youtubeBrowserCookies || 'none'
  );
  const [installing, setInstalling] = useState(false);

  const isEn = language === 'en';

  const handleSave = async () => {
    await onSave({
      downloadDir,
      maxConnectionsPerDownload,
      speedLimitKbps,
      autoStartDownloads,
      language,
      youtubeAntiBot,
      youtubeBrowserCookies: youtubeBrowserCookies as any,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-blue">
              <Settings size={18} />
            </div>
            <div>
              <h3>
                {isEn
                  ? 'Velotrap Options & Engine Configuration'
                  : 'Velotrap Seçenekler & Motor Yapılandırması'}
              </h3>
              <p className="modal-subtitle">
                {isEn
                  ? 'Language, connection channels, download directory, and streaming engines'
                  : 'Dil seçimi, bağlantı sayısı, indirme klasörü ve akış motoru ayarları'}
              </p>
            </div>
          </div>
          <button className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Language Selection Row */}
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label
              className="field-label"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
                color: '#e2e8f0',
              }}
            >
              <Languages size={15} style={{ color: '#818cf8' }} />
              <span>{isEn ? 'Language / Uygulama Dili:' : 'Uygulama Dili / Language:'}</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setLanguage('tr')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 14px',
                  borderRadius: 8,
                  border: language === 'tr' ? '2px solid #6366f1' : '1px solid #334155',
                  background: language === 'tr' ? 'rgba(99, 102, 241, 0.18)' : '#1e293b',
                  color: language === 'tr' ? '#ffffff' : '#94a3b8',
                  fontWeight: language === 'tr' ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 18 }}>🇹🇷</span>
                <span>Türkçe</span>
                {language === 'tr' && (
                  <Check size={14} style={{ marginLeft: 'auto', color: '#818cf8' }} />
                )}
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 14px',
                  borderRadius: 8,
                  border: language === 'en' ? '2px solid #6366f1' : '1px solid #334155',
                  background: language === 'en' ? 'rgba(99, 102, 241, 0.18)' : '#1e293b',
                  color: language === 'en' ? '#ffffff' : '#94a3b8',
                  fontWeight: language === 'en' ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 18 }}>🇬🇧</span>
                <span>English</span>
                {language === 'en' && (
                  <Check size={14} style={{ marginLeft: 'auto', color: '#818cf8' }} />
                )}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="field-label">
              {isEn ? 'Default Download Folder:' : 'Varsayılan İndirme Klasörü:'}
            </label>
            <div className="input-with-btn">
              <input
                type="text"
                className="idm-input flex-1"
                value={downloadDir}
                onChange={(e) => setDownloadDir(e.target.value)}
              />
              <button
                className="btn-secondary"
                onClick={async () => {
                  const dir = await onSelectDir();
                  if (dir) setDownloadDir(dir);
                }}
              >
                <FolderOpen size={14} /> {isEn ? 'Browse...' : 'Seç'}
              </button>
            </div>
          </div>

          <div className="form-row-2col">
            <div className="form-group">
              <label className="field-label">
                {isEn
                  ? 'Max Parallel Streams per Download:'
                  : 'Varsayılan Maksimum Bağlantı (Parça) Sayısı:'}
              </label>
              <select
                className="idm-select full-width"
                value={maxConnectionsPerDownload}
                onChange={(e) => setMaxConnectionsPerDownload(Number(e.target.value))}
              >
                <option value={4}>{isEn ? '4 Connections' : '4 Bağlantı'}</option>
                <option value={8}>{isEn ? '8 Connections' : '8 Bağlantı'}</option>
                <option value={16}>
                  {isEn ? '16 Connections (Recommended)' : '16 Bağlantı (Önerilen)'}
                </option>
                <option value={32}>
                  {isEn ? '32 Connections (Maximum)' : '32 Bağlantı (Maksimum)'}
                </option>
              </select>
            </div>

            <div className="form-group">
              <label className="field-label">
                {isEn
                  ? 'Global Speed Limit (KB/s — 0 = Unlimited):'
                  : 'Küresel Hız Sınırı (KB/sn — 0 = Sınırsız):'}
              </label>
              <input
                type="number"
                min={0}
                className="idm-input"
                value={speedLimitKbps}
                onChange={(e) => setSpeedLimitKbps(Math.max(0, Number(e.target.value)))}
              />
            </div>
          </div>

          <label className="checkbox-row" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={autoStartDownloads}
              onChange={(e) => setAutoStartDownloads(e.target.checked)}
            />
            <span>
              {isEn
                ? 'Start added downloads immediately without prompt'
                : 'Yeni eklenen indirmeleri onay beklemeden hemen başlat'}
            </span>
          </label>

          <div className="settings-engine-box">
            <h4>{isEn ? 'Universal Media & Streaming Engines' : 'Evrensel Video Çekme Motorları'}</h4>
            <div className="engine-status-row">
              <div>
                <strong>{isEn ? 'FFmpeg Stream Multiplexer:' : 'FFmpeg Akış Birleştirici:'}</strong>
                <div className="muted-sub">
                  {engineStatus.ffmpegPath || (isEn ? 'Not found on system' : 'Sistemde bulunamadı')}
                </div>
              </div>
              <span
                className={`engine-pill ${
                  engineStatus.ffmpegInstalled ? 'pill-ok' : 'pill-warn'
                }`}
              >
                {engineStatus.ffmpegInstalled
                  ? isEn
                    ? 'Active'
                    : 'Aktif'
                  : isEn
                  ? 'Missing'
                  : 'Yok'}
              </span>
            </div>

            <div className="engine-status-row" style={{ marginTop: 10 }}>
              <div>
                <strong>
                  {isEn
                    ? 'yt-dlp (1800+ Media Sites Support):'
                    : 'yt-dlp (1800+ Video Sitesi Desteği):'}
                </strong>
                <div className="muted-sub">
                  {engineStatus.ytDlpPath || (isEn ? 'Not downloaded yet' : 'Henüz indirilmedi')}
                </div>
              </div>
              {engineStatus.ytDlpInstalled ? (
                <span className="engine-pill pill-ok">
                  <CheckCircle2 size={13} /> {isEn ? 'Installed & Ready' : 'Kurulu & Hazır'}
                </span>
              ) : (
                <button
                  className="btn-sm btn-accent"
                  disabled={installing}
                  onClick={async () => {
                    setInstalling(true);
                    try {
                      await onInstallYtDlp();
                    } finally {
                      setInstalling(false);
                    }
                  }}
                >
                  {installing ? (
                    <>
                      <Loader2 size={13} className="spin" />{' '}
                      {ytDlpProgress
                        ? `%${ytDlpProgress.pct}`
                        : isEn
                        ? 'Downloading...'
                        : 'İndiriliyor...'}
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} /> {isEn ? '1-Click Auto Install' : '1-Tıkla Otomatik Kur'}
                    </>
                  )}
                </button>
              )}
            </div>

            <div
              className="engine-status-row"
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div>
                <strong>
                  {isEn
                    ? 'YouTube PO-Token & Anti-Bot Shield:'
                    : 'YouTube PO-Token & Botguard Kalkanı:'}
                </strong>
                <div className="muted-sub">
                  {isEn
                    ? 'Bypasses HTTP 403 & bot verification challenges via mobile client cascade (Android/iOS/Web)'
                    : 'HTTP 403 ve bot doğrulama engellerini mobil istemci rotasyonu ve JS motoruyla otomatik aşar'}
                </div>
              </div>
              <span className={`engine-pill ${youtubeAntiBot ? 'pill-ok' : 'pill-warn'}`}>
                {youtubeAntiBot ? (
                  <>
                    <ShieldCheck size={13} /> {isEn ? 'Protected' : 'Korumalı & Aktif'}
                  </>
                ) : isEn ? (
                  'Disabled'
                ) : (
                  'Devre Dışı'
                )}
              </span>
            </div>

            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="checkbox-row" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={youtubeAntiBot}
                  onChange={(e) => setYoutubeAntiBot(e.target.checked)}
                />
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {isEn
                    ? 'Enable Automated PO-Token & Mobile Player Cascade'
                    : 'Otomatik PO-Token & Mobil İstemci Korumasını Etkinleştir'}
                </span>
              </label>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 4,
                }}
              >
                <span className="muted-sub" style={{ fontSize: 12 }}>
                  {isEn
                    ? 'Browser Cookies for Private/Age-Restricted Videos:'
                    : 'Gizli / Yaş Kısıtlamalı Videolar İçin Tarayıcı Çerezleri:'}
                </span>
                <select
                  className="idm-select"
                  style={{ fontSize: 12, padding: '3px 8px' }}
                  value={youtubeBrowserCookies}
                  onChange={(e) => setYoutubeBrowserCookies(e.target.value)}
                >
                  <option value="none">
                    {isEn ? 'Disabled (Guest Mode)' : 'Devre Dışı (Misafir Modu)'}
                  </option>
                  <option value="safari">Safari</option>
                  <option value="chrome">Google Chrome</option>
                  <option value="brave">Brave</option>
                  <option value="firefox">Firefox</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {isEn ? 'Cancel' : 'İptal'}
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {isEn ? 'Save Settings' : 'Ayarları Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ExtensionModalProps {
  onClose: () => void;
  onOpenExtensionFolder?: () => void;
  onInstallHelper?: () => void;
  customExtPath?: string;
  language?: AppLanguage;
}

export const ExtensionModal: React.FC<ExtensionModalProps> = ({
  onClose,
  onOpenExtensionFolder,
  onInstallHelper,
  customExtPath,
  language = 'tr',
}) => {
  const isEn = language === 'en';
  const extPath = customExtPath || 'browser-extension';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(extPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAutoInstall = () => {
    if (onInstallHelper) {
      onInstallHelper();
    } else {
      handleCopy();
      if (onOpenExtensionFolder) onOpenExtensionFolder();
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-purple">
              <Globe size={18} />
            </div>
            <div>
              <h3>
                {isEn
                  ? 'Velotrap — Google Chrome Extension Setup'
                  : 'Velotrap — Google Chrome Eklentisi Kurulumu'}
              </h3>
              <p className="modal-subtitle">
                {isEn
                  ? 'Enables the "Download Video" button directly on YouTube, Instagram, X and movie websites'
                  : 'YouTube, Instagram, X ve film sitelerinde "Videoyu İndir" butonunu etkinleştirir'}
              </p>
            </div>
          </div>
          <button className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div
            className="settings-engine-box"
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              borderColor: 'rgba(245, 158, 11, 0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <h4 style={{ color: '#f59e0b', margin: 0, fontSize: 13.5 }}>
                  {isEn ? '🚀 Quick Setup Helper' : '🚀 Hızlı Kurulum Yardımcısı'}
                </h4>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#cbd5e1' }}>
                  {isEn
                    ? 'Click the button below to launch Google Chrome and open the extension folder in Finder.'
                    : "Aşağıdaki butona bastığınızda Google Chrome otomatik açılır ve eklenti klasörü Finder'da gösterilir."}
                </p>
              </div>
              <button
                className="btn-primary"
                onClick={handleAutoInstall}
                style={{
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none',
                }}
              >
                <Zap size={14} />{' '}
                {isEn ? 'Launch Chrome & Start Setup' : "Chrome'u Aç & Kurulumu Başlat"}
              </button>
            </div>
          </div>

          <div className="settings-engine-box">
            <h4>{isEn ? 'Extension Folder Path' : 'Eklenti Klasör Yolu'}</h4>
            <div className="input-with-btn">
              <input type="text" className="idm-input flex-1" readOnly value={extPath} />
              <button className="btn-secondary" onClick={handleCopy}>
                {copied
                  ? isEn
                    ? '✓ Copied'
                    : '✓ Kopyalandı'
                  : isEn
                  ? 'Copy Path'
                  : 'Yolu Kopyala'}
              </button>
              <button className="btn-primary" onClick={onOpenExtensionFolder}>
                <FolderOpen size={14} /> {isEn ? 'Open Folder' : 'Klasörü Aç'}
              </button>
            </div>
          </div>

          <div className="settings-engine-box">
            <h4>{isEn ? 'Installation Steps (2 Easy Steps)' : 'Kurulum Adımları (2 Kolay Adım)'}</h4>
            <ol
              style={{
                paddingLeft: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                color: '#cbd5e1',
                lineHeight: 1.5,
              }}
            >
              <li>
                {isEn ? (
                  <>
                    On the opened Chrome page (<code>chrome://extensions</code>), turn on the{' '}
                    <strong style={{ color: '#f59e0b' }}>Developer mode</strong> switch in the top-right corner.
                  </>
                ) : (
                  <>
                    Açılan Chrome sayfasında (<code>chrome://extensions</code>) sağ üst köşedeki{' '}
                    <strong style={{ color: '#f59e0b' }}>Geliştirici modu (Developer mode)</strong> anahtarını açın.
                  </>
                )}
              </li>
              <li>
                {isEn ? (
                  <>
                    Drag & drop the <code>browser-extension</code> folder from Finder directly into{' '}
                    <strong>the Chrome page</strong> (or click *"Load unpacked"* on the top-left and select it).
                  </>
                ) : (
                  <>
                    Açılan Finder penceresindeki <code>browser-extension</code> klasörünü doğrudan{' '}
                    <strong>Chrome sayfasına sürükleyip bırakın</strong> (veya sol üstteki *"Paketlenmemiş öğe yükle"* butonuna basıp yolu seçin).
                  </>
                )}
              </li>
              <li>
                {isEn
                  ? '✓ Velotrap will automatically detect the extension once loaded, and this prompt will dismiss!'
                  : '✓ Eklenti yüklendiğinde Velotrap otomatik algılar ve bu uyarı kendiliğinden kaybolur!'}
              </li>
            </ol>
          </div>
        </div>

        <div className="modal-footer">
          <span className="muted-sub">
            {isEn ? 'Local Bridge: http://127.0.0.1:46890 (Active)' : 'Yerel Köprü: http://127.0.0.1:46890 (Aktif)'}
          </span>
          <button className="btn-primary" onClick={onClose}>
            {isEn ? 'Got It, Close' : 'Anladım, Kapat'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConverterModalProps {
  initialFilePath?: string;
  initialUrl?: string;
  onClose: () => void;
  onSelectFile: () => Promise<string | null>;
  onAnalyzeUrl: (url: string) => Promise<VideoAnalysisResult>;
  onStartUrlConvertDownload: (params: {
    url: string;
    fileName: string;
    connectionsCount: number;
    sourceType: 'direct' | 'yt-dlp' | 'hls';
    videoFormatId: string;
    videoResolution: string;
    headers?: Record<string, string>;
  }) => Promise<void>;
  onConvert: (
    inputPath: string,
    targetFormat: 'mp3-320' | 'mp3-192' | 'm4a' | 'wav' | 'mp4-h264'
  ) => Promise<{ ok: boolean; outputPath: string; sizeBytes: number }>;
  onOpenFolder: (path: string) => void;
}

const FORMAT_LABELS: Record<
  'mp3-320' | 'mp3-192' | 'm4a' | 'wav' | 'mp4-h264',
  { ext: string; formatId: string; label: string }
> = {
  'mp3-320': {
    ext: 'mp3',
    formatId: 'audio:mp3:320',
    label: 'MP3 Ses (320 kbps Stüdyo Kalitesi)',
  },
  'mp3-192': {
    ext: 'mp3',
    formatId: 'audio:mp3:192',
    label: 'MP3 Ses (192 kbps Standart)',
  },
  m4a: {
    ext: 'm4a',
    formatId: 'audio:m4a:256',
    label: 'M4A / AAC Ses (256 kbps)',
  },
  wav: {
    ext: 'wav',
    formatId: 'audio:wav:0',
    label: 'WAV Ses (Kayıpsız PCM)',
  },
  'mp4-h264': {
    ext: 'mp4',
    formatId: 'best',
    label: 'En Yüksek Kalite MP4 Video (H.264)',
  },
};

export const ConverterModal: React.FC<ConverterModalProps> = ({
  initialFilePath = '',
  initialUrl = '',
  onClose,
  onSelectFile,
  onAnalyzeUrl,
  onStartUrlConvertDownload,
  onConvert,
  onOpenFolder,
}) => {
  const [sourceMode, setSourceMode] = useState<'url' | 'file'>(
    initialFilePath && !initialUrl ? 'file' : 'url'
  );
  const [videoUrl, setVideoUrl] = useState(initialUrl);
  const [urlInfo, setUrlInfo] = useState<VideoAnalysisResult | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [probingUrl, setProbingUrl] = useState(false);

  const [inputPath, setInputPath] = useState(initialFilePath);
  const [targetFormat, setTargetFormat] = useState<
    'mp3-320' | 'mp3-192' | 'm4a' | 'wav' | 'mp4-h264'
  >('mp3-320');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ outputPath: string; sizeBytes: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.idmApi?.onConvertProgress) return;
    const unsub = window.idmApi.onConvertProgress((data) => {
      if (data.inputPath === inputPath) {
        setProgress(data.pct);
      }
    });
    return () => unsub();
  }, [inputPath]);

  useEffect(() => {
    if (initialUrl) {
      handleFetchUrlInfo(initialUrl);
    }
  }, [initialUrl]);

  const handleFetchUrlInfo = async (target = videoUrl) => {
    const clean = target.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return;
    setProbingUrl(true);
    setError(null);
    try {
      const info = await onAnalyzeUrl(clean);
      setUrlInfo(info);
      setCustomTitle(info.title || 'audio_track');
    } catch (err: any) {
      setUrlInfo(null);
    } finally {
      setProbingUrl(false);
    }
  };

  const handleStartConvert = async () => {
    setError(null);
    setResult(null);

    if (sourceMode === 'url') {
      const cleanUrl = videoUrl.trim();
      if (!cleanUrl) return;
      setConverting(true);
      try {
        let info = urlInfo;
        let titleToUse = customTitle.trim();
        if (!info && !titleToUse) {
          try {
            info = await onAnalyzeUrl(cleanUrl);
            titleToUse = info.title || 'converted_media';
          } catch {
            titleToUse = `media_${Date.now()}`;
          }
        }
        const safeTitle = (titleToUse || info?.title || `media_${Date.now()}`)
          .replace(/[<>:"/\\|?*]/g, '_')
          .slice(0, 85);
        const fmtSpec = FORMAT_LABELS[targetFormat];
        const fileName = `${safeTitle}.${fmtSpec.ext}`;

        let dlSourceType: 'direct' | 'yt-dlp' | 'hls' = 'yt-dlp';
        if (info?.extractor === 'direct-media') dlSourceType = 'direct';
        else if (info?.extractor === 'hls-native' || cleanUrl.includes('.m3u8'))
          dlSourceType = 'hls';

        await onStartUrlConvertDownload({
          url: cleanUrl,
          fileName,
          connectionsCount: 16,
          sourceType: dlSourceType,
          videoFormatId: fmtSpec.formatId,
          videoResolution: fmtSpec.label,
          headers: info?.headers,
        });
        onClose();
      } catch (err: any) {
        setError(err?.message || 'Link dönüştürme başlatılamadı.');
      } finally {
        setConverting(false);
      }
      return;
    }

    // Local file conversion mode
    if (!inputPath.trim()) return;
    setConverting(true);
    setProgress(5);
    try {
      const res = await onConvert(inputPath.trim(), targetFormat);
      setResult({ outputPath: res.outputPath, sizeBytes: res.sizeBytes });
      setProgress(100);
    } catch (err: any) {
      setError(err?.message || 'Dönüştürme işlemi başarısız oldu.');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-emerald">
              <Music size={18} />
            </div>
            <div>
              <h3>Evrensel MP3 & Video Format Dönüştürücü</h3>
              <p className="modal-subtitle">
                YouTube, X/Twitter, TikTok linklerini veya bilgisayarınızdaki videoları doğrudan
                MP3, M4A, WAV ve MP4 formatına çevirin
              </p>
            </div>
          </div>
          <button className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Source Mode Switcher: Linkten Dönüştür vs Dosyadan Dönüştür */}
          <div className="mode-switcher-bar">
            <button
              type="button"
              className={`mode-switch-btn ${sourceMode === 'url' ? 'active-audio' : ''}`}
              onClick={() => {
                setSourceMode('url');
                setError(null);
              }}
            >
              <Globe size={15} />
              <span>Video Linkinden Dönüştür (YouTube, X vb.)</span>
            </button>
            <button
              type="button"
              className={`mode-switch-btn ${sourceMode === 'file' ? 'active-video' : ''}`}
              onClick={() => {
                setSourceMode('file');
                setError(null);
              }}
            >
              <FolderOpen size={15} />
              <span>Bilgisayardaki Dosyadan Dönüştür</span>
            </button>
          </div>

          {sourceMode === 'url' ? (
            <>
              <div className="form-group">
                <label className="field-label">
                  YouTube, X/Twitter, TikTok, Instagram veya Video Linki (URL):
                </label>
                <div className="input-with-btn">
                  <input
                    type="text"
                    className="idm-input flex-1"
                    placeholder="https://www.youtube.com/watch?v=... veya https://x.com/..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    onBlur={() => handleFetchUrlInfo(videoUrl)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchUrlInfo(videoUrl)}
                  />
                  <button
                    className="btn-secondary"
                    disabled={probingUrl || !videoUrl.trim()}
                    onClick={() => handleFetchUrlInfo(videoUrl)}
                  >
                    {probingUrl ? (
                      <>
                        <Loader2 size={14} className="spin" /> Taranıyor...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Videoyu Bul
                      </>
                    )}
                  </button>
                </div>
              </div>

              {urlInfo && (
                <div className="video-meta-header" style={{ background: '#0b111d', padding: 10, borderRadius: 8, border: '1px solid rgba(148,163,184,0.16)' }}>
                  {urlInfo.thumbnail && (
                    <img
                      src={urlInfo.thumbnail}
                      alt={urlInfo.title}
                      className="video-thumb"
                      style={{ width: 110, height: 64 }}
                    />
                  )}
                  <div className="video-meta-info">
                    <div className="extractor-badges">
                      <span className="badge-extractor">{urlInfo.extractor.toUpperCase()}</span>
                      {urlInfo.durationSeconds && (
                        <span className="badge-duration">
                          Süre: {formatDuration(urlInfo.durationSeconds)}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      className="idm-input full-width"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Kaydedilecek dosya adı..."
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="form-group">
              <label className="field-label">
                Bilgisayarınızdaki Video / Ses Dosyası:
              </label>
              <div className="input-with-btn">
                <input
                  type="text"
                  className="idm-input flex-1"
                  placeholder="Dosya seçin veya yolunu yapıştırın..."
                  value={inputPath}
                  onChange={(e) => setInputPath(e.target.value)}
                />
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    const chosen = await onSelectFile();
                    if (chosen) {
                      setInputPath(chosen);
                      setResult(null);
                    }
                  }}
                >
                  <FolderOpen size={14} /> Dosya Seç
                </button>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="field-label">Dönüştürülecek Hedef Format & Kalite:</label>
            <select
              className="idm-select full-width"
              value={targetFormat}
              onChange={(e) => setTargetFormat(e.target.value as any)}
            >
              <option value="mp3-320">
                🎵 MP3 Ses Dosyası — 320 kbps (En Yüksek Stüdyo Kalitesi)
              </option>
              <option value="mp3-192">
                🎵 MP3 Ses Dosyası — 192 kbps (Standart Boyut & Kalite)
              </option>
              <option value="m4a">
                🎵 M4A / AAC Ses Dosyası — 256 kbps (Apple / Mobil Uyumlu)
              </option>
              <option value="wav">
                🎵 WAV Ses Dosyası — Sıkıştırmasız PCM (Kayıpsız)
              </option>
              <option value="mp4-h264">
                🎬 MP4 Video (H.264 + AAC) — Videodaki En Yüksek Kalite
              </option>
            </select>
          </div>

          {converting && sourceMode === 'file' && (
            <div className="settings-engine-box">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Dönüştürülüyor (FFmpeg)...</span>
                <strong>%{progress}</strong>
              </div>
              <div className="idm-segmented-bar">
                <div className="idm-segment-slot">
                  <div
                    className="idm-segment-fill seg-downloading"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {error && <div className="alert-box alert-error">{error}</div>}

          {result && sourceMode === 'file' && (
            <div className="probe-summary-banner">
              <div>
                <span className="probe-badge">TAMAMLANDI</span>
                <strong>{formatBytes(result.sizeBytes)}</strong>
                <div className="muted-sub" style={{ marginTop: 3 }}>
                  {result.outputPath}
                </div>
              </div>
              <button
                className="btn-sm btn-emerald"
                onClick={() => onOpenFolder(result.outputPath)}
              >
                <FolderOpen size={13} /> Klasörde Göster
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Kapat
          </button>
          <button
            className="btn-primary"
            disabled={
              converting ||
              (sourceMode === 'url' ? !videoUrl.trim() : !inputPath.trim())
            }
            onClick={handleStartConvert}
          >
            {converting ? (
              <>
                <Loader2 size={15} className="spin" /> İşleniyor...
              </>
            ) : sourceMode === 'url' ? (
              <>
                <Music size={15} /> Linki Dönüştür & İndir
              </>
            ) : (
              <>
                <Music size={15} /> Dosyayı Dönüştür
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
