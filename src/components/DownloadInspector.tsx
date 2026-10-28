import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  FolderOpen,
  Gauge,
  Pause,
  Play,
  ShieldCheck,
  Sliders,
  X,
  Zap,
} from 'lucide-react';
import { DownloadItem, EngineSettings } from '../types/idm';
import { formatBytes, formatEta, formatSpeed, getStatusLabel } from '../utils/formatters';

interface Props {
  item: DownloadItem;
  settings: EngineSettings;
  onClose: () => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onOpenFile: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onUpdateSpeedLimit: (kbps: number) => void;
}

export const DownloadInspector: React.FC<Props> = ({
  item,
  settings,
  onClose,
  onStart,
  onPause,
  onOpenFile,
  onOpenFolder,
  onUpdateSpeedLimit,
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'limiter' | 'completion'>('status');
  const [customSpeedKbps, setCustomSpeedKbps] = useState<string>(
    String(settings.speedLimitKbps || 2048)
  );
  const [limiterEnabled, setLimiterEnabled] = useState<boolean>(settings.speedLimitKbps > 0);
  const [openOnComplete, setOpenOnComplete] = useState<boolean>(false);

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

  const handleToggleLimiter = (checked: boolean) => {
    setLimiterEnabled(checked);
    if (checked) {
      const val = Math.max(64, parseInt(customSpeedKbps, 10) || 2048);
      onUpdateSpeedLimit(val);
    } else {
      onUpdateSpeedLimit(0);
    }
  };

  return (
    <div className="inspector-dock">
      <div className="inspector-header">
        <div className="inspector-tabs">
          <button
            className={`inspector-tab ${activeTab === 'status' ? 'active' : ''}`}
            onClick={() => setActiveTab('status')}
          >
            <Activity size={14} />
            <span>İndirme Durumu</span>
          </button>
          <button
            className={`inspector-tab ${activeTab === 'limiter' ? 'active' : ''}`}
            onClick={() => setActiveTab('limiter')}
          >
            <Gauge size={14} />
            <span>Hız Sınırlandırıcı</span>
            {settings.speedLimitKbps > 0 && (
              <span className="tab-pill">{settings.speedLimitKbps} KB/sn</span>
            )}
          </button>
          <button
            className={`inspector-tab ${activeTab === 'completion' ? 'active' : ''}`}
            onClick={() => setActiveTab('completion')}
          >
            <Sliders size={14} />
            <span>Tamamlanma Seçenekleri</span>
          </button>
        </div>

        <div className="inspector-actions">
          {item.status === 'completed' ? (
            <>
              <button className="btn-sm btn-emerald" onClick={() => onOpenFile(item.savePath)}>
                <Play size={13} /> Dosyayı Aç
              </button>
              <button className="btn-sm btn-secondary" onClick={() => onOpenFolder(item.savePath)}>
                <FolderOpen size={13} /> Klasörde Göster
              </button>
            </>
          ) : isRunning ? (
            <button className="btn-sm btn-amber" onClick={() => onPause(item.id)}>
              <Pause size={13} /> Duraklat
            </button>
          ) : (
            <button className="btn-sm btn-primary" onClick={() => onStart(item.id)}>
              <Play size={13} /> Devam Et
            </button>
          )}
          <button className="icon-close-btn" onClick={onClose} title="Paneli Kapat">
            <X size={16} />
          </button>
        </div>
      </div>

      {activeTab === 'status' && (
        <div className="inspector-body">
          <div className="inspector-meta-grid">
            <div className="meta-left">
              <div className="meta-row">
                <span className="meta-label">Dosya / Kaynak:</span>
                <span className="meta-value url-truncate" title={item.url}>
                  {item.fileName} — <span className="muted-url">{item.url}</span>
                </span>
              </div>
              <div className="meta-stats-cols">
                <div className="meta-kv">
                  <span>Durum</span>
                  <strong className={`status-text-${item.status}`}>
                    {getStatusLabel(item.status, pct)}
                  </strong>
                </div>
                <div className="meta-kv">
                  <span>Dosya Boyutu</span>
                  <strong>{formatBytes(item.totalBytes)}</strong>
                </div>
                <div className="meta-kv">
                  <span>İndirilen</span>
                  <strong>
                    {formatBytes(item.downloadedBytes)} (%{pct.toFixed(1)})
                  </strong>
                </div>
                <div className="meta-kv">
                  <span>Aktarım Hızı</span>
                  <strong className="speed-highlight">{formatSpeed(item.speedBps)}</strong>
                </div>
                <div className="meta-kv">
                  <span>Kalan Süre</span>
                  <strong>{formatEta(item.etaSeconds)}</strong>
                </div>
                <div className="meta-kv">
                  <span>Devam Etme Desteği</span>
                  <strong className={item.resumable ? 'text-yes' : 'text-no'}>
                    {item.resumable ? 'Evet (Çoklu Parça)' : 'Hayır'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Overall Progress Bar + IDM Segmented Chunk Visualizer */}
          <div className="chunk-visualizer-section">
            <div className="chunk-visualizer-header">
              <span>
                <Zap size={13} className="inline-icon" /> Dinamik Parça (Chunk) Konumları —{' '}
                {item.segments.length || item.connectionsCount} Paralel Kanal
              </span>
              <span className="pct-badge">%{pct.toFixed(1)}</span>
            </div>

            <div className="idm-segmented-bar">
              {item.segments.length > 0 ? (
                item.segments.map((seg) => {
                  const segTotal =
                    seg.endByte > seg.startByte ? seg.endByte - seg.startByte + 1 : 100;
                  const segPct =
                    seg.status === 'completed'
                      ? 100
                      : segTotal > 0
                      ? Math.min(100, (seg.downloadedBytes / segTotal) * 100)
                      : 0;
                  return (
                    <div
                      key={seg.id}
                      className="idm-segment-slot"
                      title={`Kanal #${seg.id}: %${segPct.toFixed(1)} (${formatBytes(
                        seg.downloadedBytes
                      )})`}
                    >
                      <div
                        className={`idm-segment-fill seg-${seg.status}`}
                        style={{ width: `${segPct}%` }}
                      />
                    </div>
                  );
                })
              ) : (
                <div className="idm-segment-slot">
                  <div className="idm-segment-fill seg-completed" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* IDM Classic Connection Table (N. / İndirilen / Hız / Bilgi) */}
          <div className="connections-table-wrapper">
            <table className="connections-table">
              <thead>
                <tr>
                  <th style={{ width: '56px' }}>N.</th>
                  <th style={{ width: '150px' }}>İndirilen</th>
                  <th style={{ width: '140px' }}>Kanal Hızı</th>
                  <th>Bilgi (Bağlantı Durumu)</th>
                </tr>
              </thead>
              <tbody>
                {item.segments.length > 0 ? (
                  item.segments.map((seg) => (
                    <tr key={seg.id}>
                      <td className="mono-cell">#{seg.id}</td>
                      <td className="mono-cell">{formatBytes(seg.downloadedBytes)}</td>
                      <td className="mono-cell">{formatSpeed(seg.speedBps)}</td>
                      <td>
                        <span className={`seg-status-dot dot-${seg.status}`} />
                        {seg.info}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="empty-seg-row">
                      Bağlantı kanalları indirme başladığında otomatik oluşturulur.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'limiter' && (
        <div className="inspector-body tab-padded">
          <div className="limiter-card">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={limiterEnabled}
                onChange={(e) => handleToggleLimiter(e.target.checked)}
              />
              <span>Bu ve aktif indirmeler için Hız Sınırlandırıcıyı (Speed Limiter) kullan</span>
            </label>

            <div className="limiter-input-group">
              <span>Maksimum Aktarım Hızı (KB/saniye):</span>
              <input
                type="number"
                min={64}
                max={102400}
                value={customSpeedKbps}
                onChange={(e) => setCustomSpeedKbps(e.target.value)}
                className="idm-input small-input"
              />
              <button
                className="btn-sm btn-primary"
                onClick={() => {
                  setLimiterEnabled(true);
                  onUpdateSpeedLimit(Math.max(64, parseInt(customSpeedKbps, 10) || 2048));
                }}
              >
                Uygula
              </button>
              <button
                className="btn-sm btn-secondary"
                onClick={() => {
                  setLimiterEnabled(false);
                  onUpdateSpeedLimit(0);
                }}
              >
                Sınırı Kaldır (Tam Hız)
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'completion' && (
        <div className="inspector-body tab-padded">
          <div className="limiter-card">
            <div className="completion-row">
              <ShieldCheck size={18} className="text-emerald" />
              <div>
                <strong>Otomatik Parça Doğrulama ve Birleştirme Aktif</strong>
                <p className="muted-sub">
                  Tüm paralel bağlantılar tamamlandığında dosya parçaları bütünlük kontrolünden
                  geçirilerek <code>{item.savePath}</code> konumuna kaydedilir.
                </p>
              </div>
            </div>
            <label className="checkbox-row" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={openOnComplete}
                onChange={(e) => setOpenOnComplete(e.target.checked)}
              />
              <span>İndirme tamamlandığında dosyayı otomatik olarak aç</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
