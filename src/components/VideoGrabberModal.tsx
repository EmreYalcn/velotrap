import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Film,
  Globe,
  Headphones,
  Loader2,
  Music,
  Radar,
  Sparkles,
  Tv,
  X,
  Zap,
} from 'lucide-react';
import {
  EngineStatus,
  VideoAnalysisResult,
  VideoFormatOption,
} from '../types/idm';
import { formatBytes, formatDuration } from '../utils/formatters';

interface Props {
  initialUrl?: string;
  engineStatus: EngineStatus;
  ytDlpProgress: { pct: number; statusText: string } | null;
  onClose: () => void;
  onAnalyze: (url: string) => Promise<VideoAnalysisResult>;
  onInstallYtDlp: () => Promise<void>;
  onOpenLiveSniffer: (url: string) => void;
  onConfirmDownload: (params: {
    url: string;
    fileName: string;
    connectionsCount: number;
    sourceType: 'direct' | 'yt-dlp' | 'hls';
    videoFormatId?: string;
    videoResolution?: string;
    headers?: Record<string, string>;
    totalBytes?: number;
  }) => Promise<void>;
}

const SAMPLE_STREAMS = [
  {
    label: 'Örnek HLS (.m3u8) Çoklu Kalite Akışı (Apple BipBop)',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
  },
  {
    label: 'Örnek 1080p MP4 Doğrudan Video (16x Çoklu Parça Testi)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    label: 'Örnek HD Film Fragmanı (Sintel MP4)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
];

export const VideoGrabberModal: React.FC<Props> = ({
  initialUrl = '',
  engineStatus,
  ytDlpProgress,
  onClose,
  onAnalyze,
  onInstallYtDlp,
  onOpenLiveSniffer,
  onConfirmDownload,
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [installingYt, setInstallingYt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<VideoAnalysisResult | null>(null);
  const [downloadMode, setDownloadMode] = useState<'video' | 'audio'>('video');
  const [selectedFormat, setSelectedFormat] = useState<VideoFormatOption | null>(null);
  const [connectionsCount, setConnectionsCount] = useState<number>(16);
  const [customTitle, setCustomTitle] = useState<string>('');

  const videoFormats = useMemo(
    () => (analysis ? analysis.formats.filter((f) => !f.isAudioOnly) : []),
    [analysis]
  );

  const audioFormats = useMemo(
    () => (analysis ? analysis.formats.filter((f) => f.isAudioOnly) : []),
    [analysis]
  );

  const displayedFormats = downloadMode === 'video' ? videoFormats : audioFormats;

  const handleSwitchMode = (mode: 'video' | 'audio') => {
    setDownloadMode(mode);
    const list = mode === 'video' ? videoFormats : audioFormats;
    if (list.length > 0) {
      setSelectedFormat(list[0]);
    }
  };

  const handleAnalyze = async (targetUrl = url) => {
    const clean = targetUrl.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await onAnalyze(clean);
      setAnalysis(res);
      setCustomTitle(res.title || 'video');
      setDownloadMode('video');
      const vids = res.formats.filter((f) => !f.isAudioOnly);
      if (vids.length > 0) {
        setSelectedFormat(vids[0]);
      } else if (res.formats.length > 0) {
        setSelectedFormat(res.formats[0]);
      } else {
        setError(
          'Sayfa kaynak kodunda doğrudan akış bulunamadı. Özel oynatıcı kullanan siteler için aşağıdaki "Canlı Tarayıcı Yakalayıcıyı Aç" butonunu kullanabilirsiniz.'
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Video analiz edilirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleInstallEngine = async () => {
    setInstallingYt(true);
    setError(null);
    try {
      await onInstallYtDlp();
    } catch (err: any) {
      setError(err?.message || 'yt-dlp kurulumu başarısız oldu');
    } finally {
      setInstallingYt(false);
    }
  };

  const handleStartVideoDownload = async () => {
    if (!analysis || !selectedFormat) return;

    const ext = selectedFormat.ext || (selectedFormat.isAudioOnly ? 'mp3' : 'mp4');
    const safeTitle = (customTitle || analysis.title || 'video').replace(/[<>:"/\\|?*]/g, '_');
    const resSuffix = selectedFormat.isAudioOnly
      ? ext.toUpperCase()
      : selectedFormat.formatId === 'best' || selectedFormat.formatId === 'hls_best'
      ? 'EnYuksekKalite'
      : selectedFormat.resolution.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const fileName = `${safeTitle}_${resSuffix}.${ext}`;

    let sourceType: 'direct' | 'yt-dlp' | 'hls' = 'direct';
    let targetDownloadUrl = analysis.url;

    if (selectedFormat.protocol === 'm3u8') {
      sourceType = 'hls';
      targetDownloadUrl = selectedFormat.streamUrl || analysis.url;
    } else if (selectedFormat.protocol === 'https' && selectedFormat.streamUrl) {
      sourceType = 'direct';
      targetDownloadUrl = selectedFormat.streamUrl;
    } else if (analysis.extractor === 'direct-media' && selectedFormat.isAudioOnly) {
      sourceType = 'direct';
      targetDownloadUrl = analysis.url;
    } else if (analysis.extractor === 'hls-native' && selectedFormat.isAudioOnly) {
      sourceType = 'hls';
      targetDownloadUrl = analysis.url;
    } else {
      sourceType = 'yt-dlp';
      targetDownloadUrl = analysis.url;
    }

    await onConfirmDownload({
      url: targetDownloadUrl,
      fileName,
      connectionsCount,
      sourceType,
      videoFormatId: selectedFormat.formatId,
      videoResolution: selectedFormat.resolution,
      headers: analysis.headers,
      totalBytes: selectedFormat.filesize,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-lg">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-purple">
              <Film size={18} />
            </div>
            <div>
              <h3>Evrensel Video İndirici & MP3 Ses Dönüştürücü</h3>
              <p className="modal-subtitle">
                Videodaki gerçek mevcut kaliteleri (En Yüksek Kalite veya alt çözünürlükler) seçin ya da
                MP3/Ses dosyasına dönüştürerek indirin
              </p>
            </div>
          </div>
          <button className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Engine status strip */}
          <div className="engine-banner">
            <div className="engine-pills">
              <span className="engine-pill pill-ok">
                <CheckCircle2 size={13} /> 16x HTTP Range Motoru: Aktif
              </span>
              <span className="engine-pill pill-ok">
                <CheckCircle2 size={13} /> Yerel HLS (.m3u8) Çözücü: Aktif
              </span>
              <span
                className={`engine-pill ${
                  engineStatus.ffmpegInstalled ? 'pill-ok' : 'pill-warn'
                }`}
              >
                <CheckCircle2 size={13} /> FFmpeg & MP3 Dönüştürücü:{' '}
                {engineStatus.ffmpegInstalled ? 'Hazır' : 'Bulunamadı'}
              </span>
              <span
                className={`engine-pill ${
                  engineStatus.ytDlpInstalled ? 'pill-ok' : 'pill-warn'
                }`}
              >
                <Sparkles size={13} /> yt-dlp (1800+ Site):{' '}
                {engineStatus.ytDlpInstalled ? 'Kurulu' : 'Kurulu Değil'}
              </span>
            </div>

            {!engineStatus.ytDlpInstalled && (
              <button
                className="btn-sm btn-accent"
                disabled={installingYt}
                onClick={handleInstallEngine}
              >
                {installingYt ? (
                  <>
                    <Loader2 size={13} className="spin" />{' '}
                    {ytDlpProgress ? `%${ytDlpProgress.pct}` : 'Kuruluyor...'}
                  </>
                ) : (
                  <>
                    <Download size={13} /> 1-Tıkla yt-dlp Motorunu İndir
                  </>
                )}
              </button>
            )}
          </div>

          {/* URL Input Bar */}
          <div className="video-search-box">
            <Globe size={16} className="input-prefix-icon" />
            <input
              type="text"
              className="idm-input flex-1"
              placeholder="YouTube, X/Twitter, TikTok, Instagram, Vimeo veya .m3u8 / .mp4 adresini yapıştırın..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            />
            <button
              className="btn-primary"
              disabled={loading || !url.trim()}
              onClick={() => handleAnalyze()}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="spin" /> Analiz Ediliyor...
                </>
              ) : (
                <>
                  <Sparkles size={15} /> Videoyu Analiz Et
                </>
              )}
            </button>
          </div>

          {/* Quick Sample Stream Presets */}
          <div className="sample-chips-row">
            <span className="sample-label">Hızlı Test Akışları:</span>
            {SAMPLE_STREAMS.map((s, idx) => (
              <button
                key={idx}
                className="sample-chip"
                onClick={() => {
                  setUrl(s.url);
                  handleAnalyze(s.url);
                }}
              >
                <Tv size={12} /> {s.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="alert-box alert-error">
              <AlertCircle size={16} />
              <div className="flex-1">
                <strong>{error}</strong>
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn-sm btn-primary"
                    onClick={() => {
                      onOpenLiveSniffer(url || 'https://www.google.com');
                      onClose();
                    }}
                  >
                    <Radar size={13} /> Canlı Tarayıcı Ağ Yakalayıcıda (Web Sniffer) Aç
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Analysis Result & Video vs MP3 Audio Mode Switcher */}
          {analysis && (
            <div className="video-analysis-card">
              <div className="video-meta-header">
                {analysis.thumbnail ? (
                  <img
                    src={analysis.thumbnail}
                    alt={analysis.title}
                    className="video-thumb"
                  />
                ) : (
                  <div className="video-thumb-placeholder">
                    <Film size={28} />
                  </div>
                )}
                <div className="video-meta-info">
                  <div className="extractor-badges">
                    <span className="badge-extractor">{analysis.extractor.toUpperCase()}</span>
                    {analysis.durationSeconds && (
                      <span className="badge-duration">
                        Süre: {formatDuration(analysis.durationSeconds)}
                      </span>
                    )}
                    {analysis.uploader && (
                      <span className="badge-uploader">{analysis.uploader}</span>
                    )}
                  </div>
                  <div className="form-row" style={{ marginTop: 6 }}>
                    <label className="field-label">Kayıt Başlığı:</label>
                    <input
                      type="text"
                      className="idm-input"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Mode Switcher: Video Olarak İndir vs MP3 / Ses Dosyasına Dönüştür */}
              <div className="mode-switcher-bar">
                <button
                  type="button"
                  className={`mode-switch-btn ${downloadMode === 'video' ? 'active-video' : ''}`}
                  onClick={() => handleSwitchMode('video')}
                >
                  <Film size={16} />
                  <span>Video Olarak İndir (MP4)</span>
                  <span className="mode-count-pill">{videoFormats.length} Kalite</span>
                </button>
                <button
                  type="button"
                  className={`mode-switch-btn ${downloadMode === 'audio' ? 'active-audio' : ''}`}
                  onClick={() => handleSwitchMode('audio')}
                >
                  <Headphones size={16} />
                  <span>MP3 / Ses Dosyasına Dönüştür</span>
                  <span className="mode-count-pill">{audioFormats.length} Format</span>
                </button>
              </div>

              <div className="formats-list-header">
                <span>
                  {downloadMode === 'video'
                    ? `Videoda Bulunan Gerçek Görüntü Kaliteleri (${videoFormats.length})`
                    : `Ses & MP3 Dönüştürücü Seçenekleri (${audioFormats.length})`}
                </span>
                <div className="conn-selector">
                  <span>Hızlandırma Kanalı:</span>
                  <select
                    value={connectionsCount}
                    onChange={(e) => setConnectionsCount(Number(e.target.value))}
                    className="idm-select"
                  >
                    <option value={4}>4 Kanal</option>
                    <option value={8}>8 Kanal (Önerilen)</option>
                    <option value={16}>16 Kanal (Maksimum Hız)</option>
                    <option value={32}>32 Kanal (Ekstrem)</option>
                  </select>
                </div>
              </div>

              <div className="formats-grid">
                {displayedFormats.map((fmt) => {
                  const isSelected = selectedFormat?.formatId === fmt.formatId;
                  const isBestAuto =
                    fmt.formatId === 'best' || fmt.formatId === 'hls_best';
                  return (
                    <div
                      key={fmt.formatId}
                      className={`format-option-card ${isSelected ? 'selected' : ''} ${
                        isBestAuto ? 'best-auto-card' : ''
                      }`}
                      onClick={() => setSelectedFormat(fmt)}
                    >
                      <div className="format-icon">
                        {fmt.isAudioOnly ? <Music size={18} /> : <Film size={18} />}
                      </div>
                      <div className="format-details">
                        <div className="format-title-row">
                          <strong>{fmt.resolution}</strong>
                          <span className="ext-tag">{fmt.ext.toUpperCase()}</span>
                          {isBestAuto && <span className="auto-tag">ÖNERİLEN</span>}
                        </div>
                        <span className="format-note">{fmt.note}</span>
                      </div>
                      <div className="format-size">
                        {fmt.filesize ? formatBytes(fmt.filesize) : 'Otomatik'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn-secondary"
            onClick={() => {
              onOpenLiveSniffer(url || 'https://');
              onClose();
            }}
            title="Özel koruma veya gömülü oynatıcı kullanan sitelerde videoyu oynatarak ağ trafiğinden otomatik yakalar"
          >
            <Radar size={15} /> Canlı Tarayıcı Yakalayıcı (Web Sniffer)
          </button>

          <div className="footer-right">
            <button className="btn-secondary" onClick={onClose}>
              İptal
            </button>
            <button
              className="btn-primary"
              disabled={!analysis || !selectedFormat}
              onClick={handleStartVideoDownload}
            >
              {downloadMode === 'audio' ? (
                <>
                  <Music size={15} /> MP3 / Ses Olarak Dönüştür & İndir
                </>
              ) : (
                <>
                  <Zap size={15} /> Seçili Kalitede Videoyu İndir
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
