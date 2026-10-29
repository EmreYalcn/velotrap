import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Globe,
  Headphones,
  Loader2,
  Music,
  Radar,
  RotateCcw,
  Scissors,
  Sparkles,
  Tv,
  X,
  Zap,
} from 'lucide-react';
import {
  ClipRange,
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
    clipRange?: ClipRange;
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
  const [isClipEnabled, setIsClipEnabled] = useState<boolean>(false);
  const [clipStart, setClipStart] = useState<string>('00:00');
  const [clipEnd, setClipEnd] = useState<string>('');

  const parseTimeToSeconds = (t: string): number => {
    if (!t) return 0;
    let str = t.trim().toLowerCase().replace(',', '.');
    const hMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|saat|sa\b|h\b)/i);
    const mMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|dakika|dk\b|m\b)/i);
    const sMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|saniye|sn\b|s\b)/i);
    if (hMatch || mMatch || sMatch) {
      const h = hMatch ? parseFloat(hMatch[1]) : 0;
      const m = mMatch ? parseFloat(mMatch[1]) : 0;
      const s = sMatch ? parseFloat(sMatch[1]) : 0;
      return Math.max(0, h * 3600 + m * 60 + s);
    }
    if (/^\d+(?:\.\d+)?$/.test(str)) {
      return Math.max(0, parseFloat(str));
    }
    const rawParts = str.split(':');
    const parts = rawParts.map((p) => parseFloat(p) || 0);
    if (parts.length === 3) {
      if (rawParts[2].trim().length === 3 && parts[2] >= 60) {
        return Math.max(0, parts[0] * 60 + parts[1] + parts[2] / 1000);
      }
      return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
    if (parts.length === 2) {
      return Math.max(0, parts[0] * 60 + parts[1]);
    }
    return 0;
  };

  const humanizeSeconds = (sec: number): string => {
    if (sec <= 0) return '0 saniye';
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if (h > 0) parts.push(`${h} saat`);
    if (m > 0) parts.push(`${m} dk`);
    if (s > 0 || parts.length === 0) parts.push(`${s} sn`);
    return parts.join(' ');
  };

  const formatSecondsToTime = (sec: number, forceHours = false): string => {
    const total = Math.max(0, Math.floor(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (h > 0 || forceHours) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  };

  const startSec = useMemo(() => parseTimeToSeconds(clipStart), [clipStart]);
  const endSec = useMemo(
    () => (clipEnd ? parseTimeToSeconds(clipEnd) : 0),
    [clipEnd]
  );

  const isInvalidRange = isClipEnabled && endSec > 0 && endSec <= startSec;

  const clipDurationSummary = useMemo(() => {
    if (!isClipEnabled) return null;
    const e = endSec > 0 ? endSec : (analysis?.durationSeconds || 0);
    if (e > startSec) {
      return humanizeSeconds(e - startSec);
    }
    return 'Başlangıçtan sona kadar';
  }, [isClipEnabled, startSec, endSec, analysis]);

  const handleApplyPreset = (addSec: number) => {
    const forceH = (analysis?.durationSeconds || 0) >= 3600;
    const newEnd = startSec + addSec;
    setClipEnd(formatSecondsToTime(newEnd, forceH));
  };

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
      sourceType = isClipEnabled ? 'yt-dlp' : 'direct';
      targetDownloadUrl = selectedFormat.streamUrl;
    } else if (analysis.extractor === 'direct-media' && selectedFormat.isAudioOnly) {
      sourceType = isClipEnabled ? 'yt-dlp' : 'direct';
      targetDownloadUrl = analysis.url;
    } else if (analysis.extractor === 'hls-native' && selectedFormat.isAudioOnly) {
      sourceType = 'hls';
      targetDownloadUrl = analysis.url;
    } else {
      sourceType = 'yt-dlp';
      targetDownloadUrl = analysis.url;
    }

    const forceH = startSec >= 3600 || endSec >= 3600 || (analysis.durationSeconds || 0) >= 3600;
    const clipRange: ClipRange | undefined =
      isClipEnabled && clipStart.trim()
        ? {
            startTime: formatSecondsToTime(startSec, forceH),
            endTime: endSec > startSec ? formatSecondsToTime(endSec, forceH) : undefined,
          }
        : undefined;

    await onConfirmDownload({
      url: targetDownloadUrl,
      fileName,
      connectionsCount,
      sourceType,
      videoFormatId: selectedFormat.formatId,
      videoResolution: selectedFormat.resolution,
      headers: analysis.headers,
      totalBytes: selectedFormat.filesize,
      clipRange,
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

              {/* Video Kırpıcı / Bölüm İndirme Paneli */}
              <div className="clip-panel">
                <div
                  className="clip-toggle-row"
                  onClick={() => setIsClipEnabled(!isClipEnabled)}
                >
                  <div className="clip-toggle-label">
                    <Scissors size={15} />
                    <span>Belirli Bir Bölümü Kırp & İndir (Clip & Download)</span>
                    {clipDurationSummary && (
                      <span className="clip-duration-badge">
                        <Clock size={12} /> {clipDurationSummary}
                      </span>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    className="clip-toggle-checkbox"
                    checked={isClipEnabled}
                    onChange={(e) => setIsClipEnabled(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {isClipEnabled && (
                  <div className="clip-content-box">
                    <div className="clip-controls-grid">
                      <div className="clip-input-group">
                        <label>Başlangıç (Örn: 01:30 veya 01:15:30):</label>
                        <input
                          type="text"
                          className="clip-input"
                          placeholder="00:00:00"
                          value={clipStart}
                          onChange={(e) => setClipStart(e.target.value)}
                        />
                        <span className="clip-hint-text">
                          📍 {humanizeSeconds(startSec)}
                        </span>
                      </div>
                      <div className="clip-input-group">
                        <label>Bitiş (Boş = Video Sonu):</label>
                        <input
                          type="text"
                          className={`clip-input ${isInvalidRange ? 'input-error' : ''}`}
                          placeholder={
                            analysis.durationSeconds
                              ? formatSecondsToTime(
                                  analysis.durationSeconds,
                                  analysis.durationSeconds >= 3600
                                )
                              : 'Video sonuna kadar'
                          }
                          value={clipEnd}
                          onChange={(e) => setClipEnd(e.target.value)}
                        />
                        <span className="clip-hint-text">
                          🏁 {endSec > 0 ? humanizeSeconds(endSec) : 'Video Sonuna Kadar'}
                        </span>
                      </div>
                      <div className="clip-presets">
                        <button
                          type="button"
                          className="clip-preset-btn"
                          onClick={() => handleApplyPreset(30)}
                          title="Başlangıçtan itibaren 30 saniye kırpar"
                        >
                          +30 sn
                        </button>
                        <button
                          type="button"
                          className="clip-preset-btn"
                          onClick={() => handleApplyPreset(60)}
                          title="Başlangıçtan itibaren 1 dakika kırpar"
                        >
                          +1 dk
                        </button>
                        <button
                          type="button"
                          className="clip-preset-btn"
                          onClick={() => handleApplyPreset(300)}
                          title="Başlangıçtan itibaren 5 dakika kırpar"
                        >
                          +5 dk
                        </button>
                        <button
                          type="button"
                          className="clip-preset-btn"
                          onClick={() => {
                            setClipStart('00:00');
                            setClipEnd('');
                          }}
                          title="Zamanları sıfırla"
                        >
                          <RotateCcw size={11} style={{ display: 'inline', marginRight: 2 }} /> Sıfırla
                        </button>
                      </div>
                    </div>
                    {isInvalidRange && (
                      <div className="clip-error-alert">
                        ⚠️ Bitiş zamanı ({humanizeSeconds(endSec)}), başlangıç zamanından ({humanizeSeconds(startSec)}) daha ileri bir zaman olmalıdır!
                      </div>
                    )}
                  </div>
                )}
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
              disabled={!analysis || !selectedFormat || isInvalidRange}
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
