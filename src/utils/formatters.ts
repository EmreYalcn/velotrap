import { AppLanguage, DownloadCategory, DownloadStatus } from '../types/idm';

export function formatBytes(bytes: number, lang?: AppLanguage): string {
  if (!bytes || bytes <= 0) return lang === 'en' ? 'Unknown' : 'Bilinmiyor';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
}

export function formatSpeed(bps: number, lang?: AppLanguage): string {
  if (!bps || bps <= 0) return '—';
  const unit = lang === 'en' ? '/s' : '/sn';
  return `${formatBytes(bps, lang)}${unit}`;
}

export function formatEta(seconds: number | null, lang?: AppLanguage): string {
  if (seconds === null || seconds === undefined || seconds < 0) return '—';
  const isEn = lang === 'en';
  if (seconds === 0) return isEn ? '0 s' : '0 sn';
  if (seconds > 86400) return isEn ? '> 1 day' : '> 1 gün';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) return isEn ? `${hrs}h ${mins}m` : `${hrs} sa ${mins} dk`;
  if (mins > 0) return isEn ? `${mins}m ${secs}s` : `${mins} dk ${secs} sn`;
  return isEn ? `${secs}s` : `${secs} sn`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function getStatusLabel(status: DownloadStatus, pct: number, lang?: AppLanguage): string {
  const isEn = lang === 'en';
  switch (status) {
    case 'queued':
      return isEn ? 'Queued' : 'Kuyrukta';
    case 'connecting':
      return isEn ? 'Connecting...' : 'Bağlanılıyor...';
    case 'downloading':
      return isEn ? `Downloading ${pct.toFixed(1)}%` : `%${pct.toFixed(1)} İndiriliyor`;
    case 'merging':
      return isEn ? 'Merging...' : 'Birleştiriliyor...';
    case 'paused':
      return isEn ? `Paused ${pct.toFixed(1)}%` : `%${pct.toFixed(1)} Duraklatıldı`;
    case 'completed':
      return isEn ? 'Completed' : 'Tamamlandı';
    case 'error':
      return isEn ? 'Error' : 'Hata';
  }
}

export function getCategoryLabel(cat: DownloadCategory, lang?: AppLanguage): string {
  const isEn = lang === 'en';
  switch (cat) {
    case 'all':
      return isEn ? 'All Downloads' : 'Tüm İndirmeler';
    case 'video':
      return isEn ? 'Videos' : 'Videolar';
    case 'music':
      return isEn ? 'Music' : 'Müzik';
    case 'compressed':
      return isEn ? 'Archives' : 'Sıkıştırılmış';
    case 'programs':
      return isEn ? 'Programs' : 'Programlar';
    case 'documents':
      return isEn ? 'Documents' : 'Belgeler';
  }
}
