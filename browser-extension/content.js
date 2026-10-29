(function () {
  if (window.__IDM_PRO_CONTENT_LOADED__) return;
  window.__IDM_PRO_CONTENT_LOADED__ = true;

  let activeVideo = null;
  let isHoveringWidget = false;
  let isDropdownOpen = false;
  let selectedConnections = 16;
  let activeMode = 'video'; // 'video' | 'audio'
  let currentAnalysis = null;
  let currentCtx = null;
  let hideTimeout = null;

  const localAnalysisCache = new Map();
  const capturedFrameStreams = new Set();
  const boundVideos = new WeakSet();
  const IDM_DIRECT_API = 'http://127.0.0.1:46890';

  async function directApiFallback(payload) {
    try {
      if (payload.type === 'FOCUS_IDM_APP') {
        const r = await fetch(`${IDM_DIRECT_API}/api/focus`, { method: 'POST' });
        return await r.json();
      }
      if (payload.type === 'ANALYZE_VIDEO') {
        const extraStreams = Array.isArray(payload.extraStreams)
          ? payload.extraStreams.map((u) => ({
              url: u,
              ext: String(u).toLowerCase().includes('.m3u8') ? 'm3u8' : 'mp4',
            }))
          : [];
        const r = await fetch(`${IDM_DIRECT_API}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: payload.url,
            videoSrc: payload.videoSrc || '',
            pageUrl: payload.pageUrl || window.location.href,
            title: payload.title || document.title || 'Video',
            headers: {
              Referer: window.location.href,
              'User-Agent': navigator.userAgent,
            },
            sniffedStreams: extraStreams,
          }),
        });
        return await r.json();
      }
      if (payload.type === 'START_DOWNLOAD') {
        const r = await fetch(`${IDM_DIRECT_API}/api/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: payload.url,
            fileName: payload.fileName,
            connectionsCount: payload.connectionsCount || 16,
            sourceType: payload.sourceType || 'yt-dlp',
            videoFormatId: payload.videoFormatId,
            videoResolution: payload.videoResolution,
            totalBytes: payload.totalBytes,
            pageUrl: payload.pageUrl || window.location.href,
            fallbackStreamUrls: payload.fallbackStreamUrls || [],
            headers: {
              Referer: window.location.href,
              'User-Agent': navigator.userAgent,
              ...(payload.headers || {}),
            },
            focusWindow: Boolean(payload.focusWindow),
            autoStart: true,
          }),
        });
        return await r.json();
      }
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Connection failed' };
    }
    return { ok: false };
  }

  function sendIdmMessage(payload, callback) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(payload, (res) => {
          const lastErr = chrome.runtime.lastError;
          if (!lastErr && res && res.ok) {
            if (callback) callback(res);
            return;
          }
          directApiFallback(payload).then((fallbackRes) => {
            if (callback) callback(fallbackRes);
          });
        });
        return;
      }
    } catch {
      // Extension context invalidated -> use direct HTTP bridge
    }
    directApiFallback(payload).then((fallbackRes) => {
      if (callback) callback(fallbackRes);
    });
  }

  // Listen for stream URLs intercepted by page-hook.js (fetch / XHR / player configs)
  window.addEventListener('message', (event) => {
    const data = event && event.data;
    if (data && typeof data.__idmProSniffedUrl === 'string') {
      const u = data.__idmProSniffedUrl;
      if (!capturedFrameStreams.has(u)) {
        capturedFrameStreams.add(u);
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({
              type: 'REPORT_SNIFFED_STREAM',
              url: u,
            });
          }
        } catch {}
      }
    }
  });

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'IDM_STREAMS_UPDATED' && Array.isArray(msg.streams)) {
          for (const s of msg.streams) {
            if (s && s.url) capturedFrameStreams.add(s.url);
          }
        }
      });
    }
  } catch {}

  let contentLang = 'tr';

  const I18N_CONTENT = {
    tr: {
      downloadVideo: 'Videoyu İndir',
      triggerTitle: 'Kalite Seçerek Video veya MP3 İndir',
      quickMp3Title: 'Tek Tıkla 320kbps MP3 Olarak İndir',
      videoReady: 'Video Hazır',
      statusReady: 'Hazır',
      statusRealQualities: '✓ Gerçek Kaliteler',
      statusUpdated: '✓ Boyutlar Güncellendi',
      tabVideo: '🎬 Video Kaliteleri',
      tabAudio: '🎵 MP3 / Ses İndir',
      collapseWidget: 'Kutuyu Küçült / Gizle',
      expandWidget: 'Velotrap İndiriciyi Aç',
      dragHandle: 'Taşımak için basılı tutup sürükleyin (Sıfırlamak için çift tıklayın)',
      closeMenu: 'Menüyü Kapat',
      connSpeed: 'Bağlantılar:',
      engineFooter: 'Velotrap Evrensel Motor',
      openApp: "Velotrap'ı Aç ↗",
      autoBadge: 'OTO',
      bestQualityTag: 'EnYuksekKalite',
      downloadNow: 'Hemen İndir',
      sendingMp3: '⏳ MP3 İndiriliyor...',
      sendingVideo: '⏳ Velotrap’a Gönderildi...',
      sentMp3: '✓ MP3 İndiriliyor!',
      sentVideo: '✓ İndiriliyor',
      appOffline: '⚠️ Velotrap Açık Değil!',
      // Presets
      pBestRes: 'En Yüksek Kalite (Videodaki En Üst Kalite)',
      pBestNote: 'Videoda mevcut en yüksek çözünürlüğü (4K/1080p/720p/360p) otomatik indirir',
      pFhdRes: '1080p Full HD (Varsa 1080p, yoksa en üst)',
      pFhdNote: 'MP4 Video + Ses (H.264 Tam Uyumlu)',
      pHdRes: '720p HD Kalite',
      pHdNote: 'MP4 Video + Ses (H.264 Tam Uyumlu)',
      pSdRes: '480p SD Kalite',
      pSdNote: 'MP4 Video + Ses (Standart Kalite)',
      pLowRes: '360p Düşük Boyut',
      pLowNote: 'MP4 Video + Ses (Hızlı & Düşük Veri)',
      pMp3StudioRes: 'MP3 Ses (320 kbps Stüdyo Kalitesi)',
      pMp3StudioNote: 'Videoyu doğrudan 320 kbps MP3 ses dosyasına dönüştürür',
      pMp3StdRes: 'MP3 Ses (192 kbps Standart)',
      pMp3StdNote: 'Videoyu kompakt MP3 ses dosyasına dönüştürür',
      pM4aRes: 'M4A / AAC Ses (256 kbps Orijinal)',
      pM4aNote: 'Yüksek kalite AAC ses çıkarıcı',
      pWavRes: 'WAV Ses (Kayıpsız PCM)',
      pWavNote: 'Sıkıştırmasız stüdyo WAV ses dosyası',
    },
    en: {
      downloadVideo: 'Download Video',
      triggerTitle: 'Download Video or MP3 with Quality Selection',
      quickMp3Title: '1-Click 320kbps MP3 Download',
      videoReady: 'Video Ready',
      statusReady: 'Ready',
      statusRealQualities: '✓ Real Qualities',
      statusUpdated: '✓ Sizes Updated',
      tabVideo: '🎬 Video Qualities',
      tabAudio: '🎵 Download MP3 / Audio',
      collapseWidget: 'Minimize / Collapse Box',
      expandWidget: 'Expand Velotrap Downloader',
      dragHandle: 'Click and drag to move (Double-click to reset)',
      closeMenu: 'Close Menu',
      connSpeed: 'Links:',
      engineFooter: 'Velotrap Universal Engine',
      openApp: 'Open Velotrap ↗',
      autoBadge: 'AUTO',
      bestQualityTag: 'BestQuality',
      downloadNow: 'Download',
      sendingMp3: '⏳ Downloading MP3...',
      sendingVideo: '⏳ Sent to Velotrap...',
      sentMp3: '✓ Downloading MP3!',
      sentVideo: '✓ Downloading',
      appOffline: '⚠️ Velotrap Not Open!',
      // Presets
      pBestRes: 'Highest Quality (Best Available in Video)',
      pBestNote: 'Auto downloads highest available resolution (4K/1080p/720p/360p)',
      pFhdRes: '1080p Full HD (or highest available)',
      pFhdNote: 'MP4 Video + Audio (H.264 Compatible)',
      pHdRes: '720p HD Quality',
      pHdNote: 'MP4 Video + Audio (H.264 Compatible)',
      pSdRes: '480p SD Quality',
      pSdNote: 'MP4 Video + Audio (Standard Quality)',
      pLowRes: '360p Data Saver',
      pLowNote: 'MP4 Video + Audio (Fast & Low Data)',
      pMp3StudioRes: 'MP3 Audio (320 kbps Studio Quality)',
      pMp3StudioNote: 'Directly converts video to 320 kbps MP3 audio file',
      pMp3StdRes: 'MP3 Audio (192 kbps Standard)',
      pMp3StdNote: 'Converts video to compact MP3 audio file',
      pM4aRes: 'M4A / AAC Audio (256 kbps Original)',
      pM4aNote: 'High quality AAC audio extractor',
      pWavRes: 'WAV Audio (Lossless PCM)',
      pWavNote: 'Studio quality raw uncompressed audio',
    },
  };

  function t(key) {
    const dict = I18N_CONTENT[contentLang] || I18N_CONTENT.tr;
    return dict[key] || I18N_CONTENT.tr[key] || '';
  }

  /**
   * Instant Preset Options — Shown in 0ms the instant the user clicks "Videoyu İndir"!
   * Works with yt-dlp's smart height/codec selectors AND HLS/Direct stream fallbacks.
   */
  function getInstantDefaultAnalysis(ctx) {
    return {
      url: ctx.url,
      title: ctx.title || 'Video',
      extractor: 'instant',
      headers: { Referer: ctx.pageUrl },
      formats: [
        {
          formatId: 'best',
          ext: 'mp4',
          resolution: t('pBestRes'),
          note: t('pBestNote'),
          isAudioOnly: false,
          needsMerge: true,
          protocol: 'yt-dlp',
        },
        {
          formatId: 'height:1080',
          ext: 'mp4',
          resolution: t('pFhdRes'),
          note: t('pFhdNote'),
          isAudioOnly: false,
          needsMerge: true,
          protocol: 'yt-dlp',
        },
        {
          formatId: 'height:720',
          ext: 'mp4',
          resolution: t('pHdRes'),
          note: t('pHdNote'),
          isAudioOnly: false,
          needsMerge: true,
          protocol: 'yt-dlp',
        },
        {
          formatId: 'height:480',
          ext: 'mp4',
          resolution: t('pSdRes'),
          note: t('pSdNote'),
          isAudioOnly: false,
          needsMerge: true,
          protocol: 'yt-dlp',
        },
        {
          formatId: 'height:360',
          ext: 'mp4',
          resolution: t('pLowRes'),
          note: t('pLowNote'),
          isAudioOnly: false,
          needsMerge: true,
          protocol: 'yt-dlp',
        },
        {
          formatId: 'audio:mp3:320',
          ext: 'mp3',
          resolution: t('pMp3StudioRes'),
          note: t('pMp3StudioNote'),
          isAudioOnly: true,
          needsMerge: true,
          protocol: 'yt-dlp',
        },
        {
          formatId: 'audio:mp3:192',
          ext: 'mp3',
          resolution: t('pMp3StdRes'),
          note: t('pMp3StdNote'),
          isAudioOnly: true,
          needsMerge: true,
          protocol: 'yt-dlp',
        },
        {
          formatId: 'audio:m4a:256',
          ext: 'm4a',
          resolution: t('pM4aRes'),
          note: t('pM4aNote'),
          isAudioOnly: true,
          needsMerge: true,
          protocol: 'yt-dlp',
        },
        {
          formatId: 'audio:wav:0',
          ext: 'wav',
          resolution: t('pWavRes'),
          note: t('pWavNote'),
          isAudioOnly: true,
          needsMerge: true,
          protocol: 'yt-dlp',
        },
      ],
    };
  }

  // Clean up any stale host left from a previous extension reload
  document.querySelectorAll('#idm-pro-extension-host').forEach((oldHost) => {
    try {
      oldHost.remove();
    } catch {}
  });

  // Create Shadow DOM host for complete CSS isolation
  const host = document.createElement('div');
  host.id = 'idm-pro-extension-host';
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
  });
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
    }

    .idm-widget {
      position: fixed;
      z-index: 2147483647;
      pointer-events: auto;
      display: none;
      flex-direction: column;
      align-items: flex-end;
      user-select: none;
      filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.65));
      transition: filter 0.15s ease;
    }

    .idm-widget.visible {
      display: flex;
    }

    .idm-widget.dragging {
      opacity: 0.95;
      cursor: grabbing !important;
      transition: none !important;
      filter: drop-shadow(0 12px 30px rgba(59, 130, 246, 0.45));
    }

    .idm-bar {
      display: inline-flex;
      align-items: center;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96));
      border: 1px solid rgba(99, 102, 241, 0.6);
      border-radius: 8px;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    .idm-drag-handle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 7px;
      height: 31px;
      color: rgba(255, 255, 255, 0.4);
      cursor: grab;
      user-select: none;
      background: rgba(255, 255, 255, 0.04);
      border-right: 1px solid rgba(255, 255, 255, 0.12);
      transition: color 0.15s, background 0.15s;
    }

    .idm-drag-handle:hover {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.15);
    }

    .idm-drag-handle:active,
    .idm-widget.dragging .idm-drag-handle {
      cursor: grabbing !important;
    }

    .idm-collapse-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 25px;
      height: 31px;
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.5);
      border: none;
      border-left: 1px solid rgba(255, 255, 255, 0.12);
      font-size: 13px;
      cursor: pointer;
      transition: color 0.15s, background 0.15s;
    }

    .idm-collapse-btn:hover {
      color: #f87171;
      background: rgba(239, 68, 68, 0.22);
    }

    .idm-mini-pill {
      display: none;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96));
      border: 1px solid rgba(99, 102, 241, 0.65);
      border-radius: 9999px;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      backdrop-filter: blur(12px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
      transition: transform 0.12s, border-color 0.15s, box-shadow 0.15s;
      user-select: none;
    }

    .idm-mini-pill:hover {
      border-color: #38bdf8;
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(56, 189, 248, 0.35);
    }

    .idm-mini-drag {
      display: inline-flex;
      align-items: center;
      color: rgba(255, 255, 255, 0.4);
      cursor: grab;
      margin-right: 1px;
    }

    .idm-mini-drag:hover {
      color: #38bdf8;
    }

    .idm-mini-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 17px;
      height: 17px;
      background: linear-gradient(135deg, #f59e0b, #ef4444);
      border-radius: 50%;
      font-size: 10px;
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
    }

    .idm-mini-label {
      letter-spacing: 0.3px;
      color: #f1f5f9;
    }

    .idm-mini-expand-icon {
      font-size: 10px;
      color: #38bdf8;
      opacity: 0.8;
      margin-left: 2px;
    }

    .idm-widget.collapsed .idm-bar,
    .idm-widget.collapsed .idm-dropdown {
      display: none !important;
    }

    .idm-widget.collapsed .idm-mini-pill {
      display: inline-flex !important;
    }

    .idm-dd-drag-indicator {
      display: inline-flex;
      align-items: center;
      color: rgba(255, 255, 255, 0.35);
      cursor: grab;
      padding: 0 4px;
    }

    .idm-dd-drag-indicator:hover {
      color: #38bdf8;
    }

    .idm-dd-close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 4px;
      color: #94a3b8;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }

    .idm-dd-close-btn:hover {
      background: rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }

    .idm-main-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 12px;
      background: linear-gradient(135deg, #2563eb 0%, #6d28d9 100%);
      color: #ffffff;
      border: none;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.1px;
      transition: filter 0.12s;
    }

    .idm-main-btn:hover {
      filter: brightness(1.12);
    }

    .idm-quick-mp3-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 7px 10px;
      background: linear-gradient(135deg, #db2777 0%, #9333ea 100%);
      color: #ffffff;
      border: none;
      border-left: 1px solid rgba(255, 255, 255, 0.22);
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      transition: filter 0.12s;
    }

    .idm-quick-mp3-btn:hover {
      filter: brightness(1.15);
    }

    .idm-logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      font-size: 11px;
    }

    .idm-caret {
      font-size: 10px;
      opacity: 0.9;
      margin-left: 2px;
      transition: transform 0.15s;
    }

    .idm-widget.open .idm-caret {
      transform: rotate(180deg);
    }

    .idm-dropdown {
      margin-top: 6px;
      width: 375px;
      max-height: 420px;
      background: #0f172a;
      border: 1px solid rgba(148, 163, 184, 0.3);
      border-radius: 10px;
      overflow: hidden;
      display: none;
      flex-direction: column;
      color: #f8fafc;
    }

    .idm-widget.open .idm-dropdown {
      display: flex;
    }

    .idm-dd-header {
      padding: 10px 12px;
      background: #162033;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .idm-dd-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .idm-video-title {
      font-size: 12px;
      font-weight: 600;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .idm-scan-badge {
      font-size: 10px;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      padding: 2px 6px;
      border-radius: 99px;
      white-space: nowrap;
    }

    .idm-mode-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
      background: #090e18;
      padding: 4px;
      border-radius: 7px;
      border: 1px solid rgba(148, 163, 184, 0.16);
    }

    .idm-mode-tab {
      padding: 6px 8px;
      border-radius: 5px;
      border: 1px solid transparent;
      background: transparent;
      color: #94a3b8;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.12s;
    }

    .idm-mode-tab:hover {
      color: #f8fafc;
    }

    .idm-mode-tab.active-video {
      background: rgba(37, 99, 235, 0.28);
      border-color: rgba(59, 130, 246, 0.55);
      color: #60a5fa;
    }

    .idm-mode-tab.active-audio {
      background: rgba(219, 39, 119, 0.28);
      border-color: rgba(236, 72, 153, 0.55);
      color: #f472b6;
    }

    .idm-conn-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #94a3b8;
    }

    .idm-conn-pills {
      display: flex;
      gap: 4px;
    }

    .conn-pill {
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid rgba(148, 163, 184, 0.25);
      background: #0b111e;
      color: #94a3b8;
      font-size: 10.5px;
      font-weight: 600;
      cursor: pointer;
    }

    .conn-pill.active {
      background: #2563eb;
      border-color: #3b82f6;
      color: #fff;
    }

    .idm-dd-list {
      overflow-y: auto;
      max-height: 270px;
      display: flex;
      flex-direction: column;
    }

    .idm-format-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
      background: transparent;
      color: #f1f5f9;
      text-align: left;
      border-left: none;
      border-right: none;
      border-top: none;
      width: 100%;
      cursor: pointer;
      transition: background 0.1s;
    }

    .idm-format-item:hover {
      background: rgba(59, 130, 246, 0.22);
    }

    .idm-format-item.best-row {
      background: linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(37, 99, 235, 0.12));
      border-bottom: 1px solid rgba(16, 185, 129, 0.3);
    }

    .idm-format-item.best-row:hover {
      background: linear-gradient(90deg, rgba(16, 185, 129, 0.26), rgba(37, 99, 235, 0.22));
    }

    .fmt-badge {
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      font-family: monospace;
      min-width: 38px;
      text-align: center;
      background: rgba(99, 102, 241, 0.2);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.35);
    }

    .fmt-badge.audio {
      background: rgba(236, 72, 153, 0.18);
      color: #f472b6;
      border-color: rgba(236, 72, 153, 0.35);
    }

    .fmt-badge.best {
      background: rgba(16, 185, 129, 0.22);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.45);
    }

    .fmt-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }

    .fmt-res {
      font-size: 12.5px;
      font-weight: 600;
      color: #f8fafc;
    }

    .fmt-note {
      font-size: 10.5px;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .fmt-size {
      font-size: 11px;
      font-family: monospace;
      color: #38bdf8;
      font-weight: 600;
      white-space: nowrap;
    }

    .idm-dd-footer {
      padding: 7px 12px;
      background: #0b111e;
      border-top: 1px solid rgba(148, 163, 184, 0.14);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
    }

    .idm-link-btn {
      background: none;
      border: none;
      color: #60a5fa;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .idm-link-btn:hover {
      text-decoration: underline;
    }
  `;
  shadow.appendChild(styleEl);

  const widget = document.createElement('div');
  widget.className = 'idm-widget';
  widget.innerHTML = `
    <!-- Full Download Bar -->
    <div class="idm-bar" id="idm-bar">
      <div class="idm-drag-handle" id="idm-drag-handle" title="${t('dragHandle')}">
        <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
          <circle cx="2" cy="2" r="1.3"/>
          <circle cx="6" cy="2" r="1.3"/>
          <circle cx="2" cy="6" r="1.3"/>
          <circle cx="6" cy="6" r="1.3"/>
          <circle cx="2" cy="10" r="1.3"/>
          <circle cx="6" cy="10" r="1.3"/>
        </svg>
      </div>
      <button class="idm-main-btn" id="idm-trigger-btn" title="${t('triggerTitle')}">
        <span class="idm-logo-badge">⚡</span>
        <span id="idm-btn-label">Videoyu İndir</span>
        <span class="idm-caret">▾</span>
      </button>
      <button class="idm-quick-mp3-btn" id="idm-quick-mp3" title="${t('quickMp3Title')}">
        🎵 MP3
      </button>
      <button class="idm-collapse-btn" id="idm-collapse-btn" title="${t('collapseWidget')}">
        ✕
      </button>
    </div>

    <!-- Collapsed / Mini Floating Pill -->
    <div class="idm-mini-pill" id="idm-mini-pill" title="${t('expandWidget')}">
      <div class="idm-mini-drag" id="idm-mini-drag" title="${t('dragHandle')}">
        <svg width="7" height="11" viewBox="0 0 7 11" fill="currentColor">
          <circle cx="1.5" cy="2" r="1.2"/>
          <circle cx="5.5" cy="2" r="1.2"/>
          <circle cx="1.5" cy="5.5" r="1.2"/>
          <circle cx="5.5" cy="5.5" r="1.2"/>
          <circle cx="1.5" cy="9" r="1.2"/>
          <circle cx="5.5" cy="9" r="1.2"/>
        </svg>
      </div>
      <span class="idm-mini-icon">⚡</span>
      <span class="idm-mini-label">Velotrap</span>
      <span class="idm-mini-expand-icon">↗</span>
    </div>

    <!-- Dropdown Menu -->
    <div class="idm-dropdown" id="idm-dropdown">
      <div class="idm-dd-header">
        <div class="idm-dd-title-row">
          <div class="idm-dd-drag-indicator" id="idm-dd-drag" title="${t('dragHandle')}">
            <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
              <circle cx="2" cy="2" r="1.3"/>
              <circle cx="6" cy="2" r="1.3"/>
              <circle cx="2" cy="6" r="1.3"/>
              <circle cx="6" cy="6" r="1.3"/>
              <circle cx="2" cy="10" r="1.3"/>
              <circle cx="6" cy="10" r="1.3"/>
            </svg>
          </div>
          <span class="idm-video-title" id="idm-dd-title">Video Hazır</span>
          <span class="idm-scan-badge" id="idm-scan-status">Hazır</span>
          <button class="idm-dd-close-btn" id="idm-dd-close" title="${t('closeMenu')}">✕</button>
        </div>
        <div class="idm-mode-tabs">
          <button class="idm-mode-tab active-video" id="idm-tab-video">
            🎬 Video Kaliteleri
          </button>
          <button class="idm-mode-tab" id="idm-tab-audio">
            🎵 MP3 / Ses İndir
          </button>
        </div>
        <div class="idm-conn-row">
          <span>Bağlantılar:</span>
          <div class="idm-conn-pills" id="idm-conn-pills">
            <button class="conn-pill" data-conn="8">8x</button>
            <button class="conn-pill active" data-conn="16">16x</button>
            <button class="conn-pill" data-conn="32">32x</button>
          </div>
        </div>
      </div>
      <div class="idm-dd-list" id="idm-dd-list"></div>
      <div class="idm-dd-footer">
        <span>Velotrap Evrensel Motor</span>
        <button class="idm-link-btn" id="idm-open-app-btn">Velotrap'ı Aç ↗</button>
      </div>
    </div>
  `;
  shadow.appendChild(widget);

  const triggerBtn = widget.querySelector('#idm-trigger-btn');
  const quickMp3Btn = widget.querySelector('#idm-quick-mp3');
  const btnLabel = widget.querySelector('#idm-btn-label');
  const ddTitle = widget.querySelector('#idm-dd-title');
  const scanStatus = widget.querySelector('#idm-scan-status');
  const ddList = widget.querySelector('#idm-dd-list');
  const openAppBtn = widget.querySelector('#idm-open-app-btn');
  const tabVideoBtn = widget.querySelector('#idm-tab-video');
  const tabAudioBtn = widget.querySelector('#idm-tab-audio');
  const connPills = widget.querySelectorAll('.conn-pill');
  const collapseBtn = widget.querySelector('#idm-collapse-btn');
  const miniPill = widget.querySelector('#idm-mini-pill');
  const ddCloseBtn = widget.querySelector('#idm-dd-close');
  const dragHandle = widget.querySelector('#idm-drag-handle');
  const miniDrag = widget.querySelector('#idm-mini-drag');
  const ddDrag = widget.querySelector('#idm-dd-drag');

  function applyContentLanguage(newLang) {
    if (!newLang || (newLang !== 'tr' && newLang !== 'en')) return;
    contentLang = newLang;

    if (
      btnLabel &&
      !btnLabel.textContent.startsWith('✓') &&
      !btnLabel.textContent.startsWith('⏳') &&
      !btnLabel.textContent.startsWith('⚠️')
    ) {
      btnLabel.textContent = t('downloadVideo');
    }
    if (triggerBtn) triggerBtn.title = t('triggerTitle');
    if (quickMp3Btn) quickMp3Btn.title = t('quickMp3Title');
    if (tabVideoBtn) tabVideoBtn.textContent = t('tabVideo');
    if (tabAudioBtn) tabAudioBtn.textContent = t('tabAudio');
    if (collapseBtn) collapseBtn.title = t('collapseWidget');
    if (miniPill) miniPill.title = t('expandWidget');
    if (dragHandle) dragHandle.title = t('dragHandle');
    if (miniDrag) miniDrag.title = t('dragHandle');
    if (ddDrag) ddDrag.title = t('dragHandle');
    if (ddCloseBtn) ddCloseBtn.title = t('closeMenu');

    const connRowSpan = widget.querySelector('.idm-conn-row > span');
    if (connRowSpan) connRowSpan.textContent = t('connSpeed');

    const footerSpan = widget.querySelector('.idm-dd-footer > span');
    if (footerSpan) footerSpan.textContent = t('engineFooter');

    if (openAppBtn) openAppBtn.textContent = t('openApp');

    if (isDropdownOpen && currentCtx) {
      if (currentAnalysis && currentAnalysis.extractor === 'instant') {
        currentAnalysis = getInstantDefaultAnalysis(currentCtx);
      }
      renderFormatsList(currentAnalysis, currentCtx);
    }
  }

  // Load language preference from storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['appLanguage'], (res) => {
      if (res && res.appLanguage) {
        applyContentLanguage(res.appLanguage);
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.appLanguage) {
        applyContentLanguage(changes.appLanguage.newValue);
      }
    });
  }

  function setMode(mode) {
    activeMode = mode;
    if (mode === 'video') {
      tabVideoBtn.classList.add('active-video');
      tabAudioBtn.classList.remove('active-audio');
    } else {
      tabVideoBtn.classList.remove('active-video');
      tabAudioBtn.classList.add('active-audio');
    }
    if (currentAnalysis && currentCtx) {
      renderFormatsList(currentAnalysis, currentCtx);
    }
  }

  tabVideoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMode('video');
  });

  tabAudioBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMode('audio');
  });

  connPills.forEach((pill) => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedConnections = Number(pill.dataset.conn) || 16;
      connPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  openAppBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sendIdmMessage({ type: 'FOCUS_IDM_APP' });
  });

  let isDragging = false;
  let dragHasMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let widgetStartLeft = 0;
  let widgetStartTop = 0;
  let customOffsetX = null;
  let customOffsetY = null;
  let isCollapsed = false;

  function onWidgetPointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, select, .idm-format-item, .conn-pill, .idm-mode-tab')) {
      return;
    }

    isDragging = true;
    dragHasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = widget.getBoundingClientRect();
    widgetStartLeft = rect.left;
    widgetStartTop = rect.top;

    widget.classList.add('dragging');
    window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', onWindowPointerUp, { passive: false });
  }

  function onWindowPointerMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (!dragHasMoved && Math.hypot(dx, dy) > 3) {
      dragHasMoved = true;
    }

    if (dragHasMoved) {
      e.preventDefault();
      let newLeft = widgetStartLeft + dx;
      let newTop = widgetStartTop + dy;

      const maxLeft = Math.max(5, window.innerWidth - widget.offsetWidth - 5);
      const maxTop = Math.max(5, window.innerHeight - widget.offsetHeight - 5);
      newLeft = Math.max(5, Math.min(newLeft, maxLeft));
      newTop = Math.max(5, Math.min(newTop, maxTop));

      widget.style.left = `${newLeft}px`;
      widget.style.top = `${newTop}px`;

      if (activeVideo && document.contains(activeVideo)) {
        const vRect = activeVideo.getBoundingClientRect();
        customOffsetX = newLeft - vRect.left;
        customOffsetY = newTop - vRect.top;
      }
    }
  }

  function onWindowPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    widget.classList.remove('dragging');
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
  }

  widget.addEventListener('pointerdown', onWidgetPointerDown);

  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    isCollapsed = true;
    isDropdownOpen = false;
    widget.classList.remove('open');
    widget.classList.add('collapsed');
    requestAnimationFrame(updateWidgetPosition);
  });

  miniPill.addEventListener('click', (e) => {
    if (dragHasMoved) return;
    e.stopPropagation();
    e.preventDefault();
    isCollapsed = false;
    widget.classList.remove('collapsed');
    requestAnimationFrame(updateWidgetPosition);
  });

  ddCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    isDropdownOpen = false;
    widget.classList.remove('open');
    requestAnimationFrame(updateWidgetPosition);
  });

  function resetWidgetPosition(e) {
    e.stopPropagation();
    customOffsetX = null;
    customOffsetY = null;
    requestAnimationFrame(updateWidgetPosition);
  }

  if (dragHandle) dragHandle.addEventListener('dblclick', resetWidgetPosition);
  if (miniDrag) miniDrag.addEventListener('dblclick', resetWidgetPosition);
  if (ddDrag) ddDrag.addEventListener('dblclick', resetWidgetPosition);

  widget.addEventListener('mouseenter', () => {
    isHoveringWidget = true;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  });

  widget.addEventListener('mouseleave', () => {
    isHoveringWidget = false;
    if (!isDropdownOpen && !isDragging) {
      scheduleHide();
    }
  });

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return t('downloadNow');
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  }

  /**
   * Scans Performance API + DOM + page-hook for all .m3u8 / .mp4 stream URLs in this frame
   */
  function collectAllPageStreams(videoEl) {
    const streams = new Set(capturedFrameStreams);

    // 1. Check Performance Resource Timing API for any .m3u8 / .mp4 / .webm / .m4a requests
    try {
      const resources = performance.getEntriesByType('resource') || [];
      for (const r of resources) {
        const name = r.name || '';
        if (!name.startsWith('http')) continue;
        if (name.includes('googlevideo.com/videoplayback')) continue;
        if (
          /\.(m3u8|mp4|webm|mkv|mov|flv|m4a|mp3)(\?|$|#)/i.test(name) ||
          name.toLowerCase().includes('.m3u8')
        ) {
          streams.add(name);
        }
      }
    } catch {}

    // 2. Check <video> and <source> elements
    if (videoEl) {
      const rawSrc = videoEl.currentSrc || videoEl.src || '';
      if (rawSrc.startsWith('http://') || rawSrc.startsWith('https://')) {
        streams.add(rawSrc);
      }
      videoEl.querySelectorAll('source[src^="http"]').forEach((s) => {
        if (s.src) streams.add(s.src);
      });
    }

    return Array.from(streams);
  }

  function extractVideoContext(videoEl) {
    const hostName = window.location.hostname.toLowerCase();
    let targetUrl = window.location.href;
    let title = document.title || 'Video';

    if (hostName.includes('x.com') || hostName.includes('twitter.com')) {
      const article = videoEl.closest('article');
      if (article) {
        const statusLink = article.querySelector('a[href*="/status/"]');
        if (statusLink && statusLink.href) {
          targetUrl = statusLink.href.replace(/\/(photo|video)\/\d+.*$/, '');
        }
        const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
        if (tweetTextEl && tweetTextEl.innerText.trim()) {
          title = tweetTextEl.innerText.trim().slice(0, 70);
        }
      }
    } else if (hostName.includes('youtube.com')) {
      let card = videoEl.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-video-renderer'
      );

      // If videoEl is inside YouTube's global <ytd-video-preview> hover player on the homepage,
      // find the card underneath the video's center coordinates using elementsFromPoint!
      if (!card && (videoEl.closest('ytd-video-preview') || window.location.pathname === '/')) {
        try {
          const r = videoEl.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const els = document.elementsFromPoint(cx, cy) || [];
          for (const el of els) {
            const foundCard =
              el.closest &&
              el.closest(
                'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer'
              );
            if (foundCard) {
              card = foundCard;
              break;
            }
          }
        } catch {}
      }

      if (card) {
        const a = card.querySelector(
          'a#thumbnail[href*="/watch"], a#thumbnail[href*="/shorts/"], a#video-title-link[href], a#video-title[href], a[href*="/watch?v="]'
        );
        if (a && a.href) {
          targetUrl = a.href;
        }
        const cardTitle = card.querySelector('#video-title, #video-title-link');
        if (cardTitle && cardTitle.textContent && cardTitle.textContent.trim()) {
          title = cardTitle.textContent.trim();
        }
      } else {
        // Main watch page or Shorts player
        const previewLink = document.querySelector(
          'ytd-video-preview a[href*="/watch?v="], ytd-video-preview a[href*="/shorts/"]'
        );
        if (
          previewLink &&
          previewLink.href &&
          !window.location.pathname.startsWith('/watch') &&
          !window.location.pathname.startsWith('/shorts')
        ) {
          targetUrl = previewLink.href;
        }
        const ytTitle = document.querySelector(
          'h1.ytd-watch-metadata yt-formatted-string, ytd-reel-player-header-renderer h2'
        );
        if (ytTitle && ytTitle.innerText.trim()) {
          title = ytTitle.innerText.trim();
        } else {
          title = (document.title || 'YouTube Video')
            .replace(/^\(\d+\)\s*/, '')
            .replace(/\s*-\s*YouTube$/i, '');
        }
      }

      // Clean playlist/radio query params from YouTube watch URLs
      try {
        const parsedYt = new URL(targetUrl);
        if (parsedYt.searchParams.has('v')) {
          parsedYt.searchParams.delete('list');
          parsedYt.searchParams.delete('index');
          parsedYt.searchParams.delete('start_radio');
          parsedYt.searchParams.delete('pp');
          targetUrl = parsedYt.toString();
        }
      } catch {}
    } else if (
      hostName.includes('instagram.com') ||
      hostName.includes('tiktok.com') ||
      hostName.includes('reddit.com')
    ) {
      const container = videoEl.closest(
        'article, [data-e2e="recommend-list-item-container"], shreddit-post'
      );
      if (container) {
        const link = container.querySelector(
          'a[href*="/p/"], a[href*="/reel/"], a[href*="/video/"], a[href*="/comments/"]'
        );
        if (link && link.href) {
          targetUrl = link.href;
        }
      }
    }

    const discoveredStreams = collectAllPageStreams(videoEl);
    let videoSrc = '';
    const rawSrc = videoEl.currentSrc || videoEl.src || '';
    if (rawSrc.startsWith('http://') || rawSrc.startsWith('https://')) {
      videoSrc = rawSrc;
    } else if (discoveredStreams.length > 0) {
      videoSrc = discoveredStreams[0];
    }

    return {
      url: targetUrl,
      videoSrc,
      fallbackStreamUrls: discoveredStreams,
      pageUrl: window.location.href,
      title: title.replace(/\s+/g, ' ').trim(),
    };
  }

  function updateWidgetPosition() {
    if (!activeVideo || !document.contains(activeVideo)) {
      hideWidgetImmediate();
      return;
    }

    const rect = activeVideo.getBoundingClientRect();
    if (
      rect.width < 120 ||
      rect.height < 80 ||
      rect.bottom < 40 ||
      rect.top > window.innerHeight - 40
    ) {
      if (!isDropdownOpen && !isDragging) {
        widget.classList.remove('visible');
      }
      return;
    }

    let top, left;
    if (customOffsetX !== null && customOffsetY !== null) {
      left = rect.left + customOffsetX;
      top = rect.top + customOffsetY;
    } else {
      top = Math.max(10, rect.top + 10);
      const rightEdge = Math.min(window.innerWidth - 10, rect.right - 10);
      left = Math.max(10, rightEdge - widget.offsetWidth);
    }

    const maxLeft = Math.max(5, window.innerWidth - widget.offsetWidth - 5);
    const maxTop = Math.max(5, window.innerHeight - widget.offsetHeight - 5);
    left = Math.max(5, Math.min(left, maxLeft));
    top = Math.max(5, Math.min(top, maxTop));

    widget.style.top = `${top}px`;
    widget.style.left = `${left}px`;
  }

  function showWidgetForVideo(videoEl) {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    if (activeVideo !== videoEl && !isDropdownOpen) {
      activeVideo = videoEl;
      btnLabel.textContent = t('downloadVideo');
    }
    widget.classList.add('visible');
    requestAnimationFrame(updateWidgetPosition);
  }

  function scheduleHide() {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!isHoveringWidget && !isDropdownOpen && !isDragging) {
        widget.classList.remove('visible');
      }
    }, 600);
  }

  function hideWidgetImmediate() {
    isDropdownOpen = false;
    widget.classList.remove('open');
    widget.classList.remove('visible');
  }

  // Direct 1-click MP3 button right on the floating bar!
  quickMp3Btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeVideo) return;
    const ctx = extractVideoContext(activeVideo);
    const defaultAnalysis = getInstantDefaultAnalysis(ctx);
    const mp3Fmt = defaultAnalysis.formats.find((f) => f.formatId === 'audio:mp3:320');
    triggerFormatDownload(defaultAnalysis, mp3Fmt, ctx);
  });

  // Clicking "Videoyu İndir" opens the dropdown INSTANTLY (0ms delay!)
  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!activeVideo) return;

    if (isDropdownOpen) {
      isDropdownOpen = false;
      widget.classList.remove('open');
      requestAnimationFrame(updateWidgetPosition);
      return;
    }

    isDropdownOpen = true;
    widget.classList.add('open');

    const ctx = extractVideoContext(activeVideo);
    currentCtx = ctx;
    ddTitle.textContent = ctx.title;

    const cacheKey = ctx.url + '|' + ctx.videoSrc;
    const cached = localAnalysisCache.get(cacheKey);
    if (cached) {
      currentAnalysis = cached;
      scanStatus.textContent = t('statusRealQualities');
      renderFormatsList(cached, ctx);
      requestAnimationFrame(updateWidgetPosition);
      return;
    }

    // 1. IMMEDIATELY render instant presets in 0ms so the user NEVER waits!
    currentAnalysis = getInstantDefaultAnalysis(ctx);
    scanStatus.textContent = '⚡ ' + t('statusReady');
    renderFormatsList(currentAnalysis, ctx);
    requestAnimationFrame(updateWidgetPosition);

    // 2. Simultaneously query exact formats in the background and update smoothly if open
    sendIdmMessage(
      {
        type: 'ANALYZE_VIDEO',
        url: ctx.url,
        videoSrc: ctx.videoSrc,
        extraStreams: ctx.fallbackStreamUrls,
        pageUrl: ctx.pageUrl,
        title: ctx.title,
      },
      (response) => {
        if (response && response.ok && response.analysis && Array.isArray(response.analysis.formats) && response.analysis.formats.length > 0) {
          localAnalysisCache.set(cacheKey, response.analysis);
          if (isDropdownOpen && currentCtx && currentCtx.url === ctx.url) {
            currentAnalysis = response.analysis;
            scanStatus.textContent = t('statusUpdated');
            renderFormatsList(response.analysis, ctx);
          }
        }
      }
    );
  });

  function renderFormatsList(analysis, ctx) {
    ddTitle.textContent = analysis.title || ctx.title;
    ddList.innerHTML = '';

    const allFormats = Array.isArray(analysis.formats) ? analysis.formats : [];
    const filtered = allFormats.filter((f) =>
      activeMode === 'audio' ? Boolean(f.isAudioOnly) : !f.isAudioOnly
    );

    filtered.forEach((fmt) => {
      const btn = document.createElement('button');
      const isAudio = Boolean(fmt.isAudioOnly);
      const isBest = fmt.formatId === 'best' || fmt.formatId === 'hls_best';
      btn.className = `idm-format-item ${isBest ? 'best-row' : ''}`;
      const extLabel = (fmt.ext || 'mp4').toUpperCase();
      const sizeLabel = formatBytes(fmt.filesize);

      btn.innerHTML = `
        <span class="fmt-badge ${isAudio ? 'audio' : isBest ? 'best' : ''}">
          ${isBest ? t('autoBadge') : extLabel}
        </span>
        <div class="fmt-info">
          <span class="fmt-res">${fmt.resolution}</span>
          <span class="fmt-note">${fmt.note || ''}</span>
        </div>
        <span class="fmt-size">${sizeLabel}</span>
      `;

      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        triggerFormatDownload(analysis, fmt, ctx);
      });

      ddList.appendChild(btn);
    });

    requestAnimationFrame(updateWidgetPosition);
  }

  function triggerFormatDownload(analysis, fmt, ctx) {
    const ext = fmt.ext || (fmt.isAudioOnly ? 'mp3' : 'mp4');
    const cleanTitle = (analysis.title || ctx.title || 'video')
      .replace(/^\s*[\(\[]\d+[\)\]]\s*/, '')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .trim()
      .slice(0, 80);
    const shortRes = fmt.isAudioOnly
      ? ext.toUpperCase()
      : fmt.formatId === 'best' || fmt.formatId === 'hls_best'
      ? t('bestQualityTag')
      : (fmt.resolution || '').split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const fileName = `${cleanTitle}${shortRes ? '_' + shortRes : ''}.${ext}`;

    let sourceType = 'yt-dlp';
    let targetDownloadUrl = analysis.url || ctx.url;

    if (fmt.protocol === 'm3u8' && fmt.streamUrl) {
      sourceType = 'hls';
      targetDownloadUrl = fmt.streamUrl;
    } else if (fmt.protocol === 'https' && fmt.streamUrl && !fmt.isAudioOnly) {
      sourceType = 'direct';
      targetDownloadUrl = fmt.streamUrl;
    }

    btnLabel.textContent = fmt.isAudioOnly
      ? t('sendingMp3')
      : t('sendingVideo');
    isDropdownOpen = false;
    widget.classList.remove('open');

    sendIdmMessage(
      {
        type: 'START_DOWNLOAD',
        url: targetDownloadUrl,
        fileName,
        connectionsCount: selectedConnections,
        sourceType,
        videoFormatId: fmt.formatId,
        videoResolution: fmt.resolution,
        totalBytes: fmt.filesize,
        pageUrl: ctx.pageUrl,
        fallbackStreamUrls: ctx.fallbackStreamUrls || [],
        headers: analysis.headers || {},
        focusWindow: true,
      },
      (res) => {
        if (res && res.ok) {
          btnLabel.textContent = fmt.isAudioOnly
            ? t('sentMp3')
            : `${t('sentVideo')} (${shortRes || 'MP4'})`;
        } else {
          btnLabel.textContent = t('appOffline');
        }
        setTimeout(() => {
          btnLabel.textContent = t('downloadVideo');
        }, 3500);
      }
    );
  }

  document.addEventListener('click', () => {
    if (isDropdownOpen && !isHoveringWidget) {
      isDropdownOpen = false;
      widget.classList.remove('open');
    }
  });

  function bindVideoElement(videoEl) {
    if (boundVideos.has(videoEl)) return;
    boundVideos.add(videoEl);

    videoEl.addEventListener('mouseenter', () => {
      showWidgetForVideo(videoEl);
    });

    videoEl.addEventListener('mousemove', () => {
      if (activeVideo !== videoEl && !isDropdownOpen) {
        showWidgetForVideo(videoEl);
      } else if (!widget.classList.contains('visible')) {
        showWidgetForVideo(videoEl);
      }
    });

    videoEl.addEventListener('play', () => {
      if (!activeVideo) {
        showWidgetForVideo(videoEl);
      }
    });

    videoEl.addEventListener('mouseleave', () => {
      if (!isDropdownOpen) {
        scheduleHide();
      }
    });
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      if (isHoveringWidget || isDropdownOpen) return;
      const videos = document.querySelectorAll('video');
      for (const v of videos) {
        bindVideoElement(v);
        const r = v.getBoundingClientRect();
        if (
          r.width >= 120 &&
          r.height >= 80 &&
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        ) {
          showWidgetForVideo(v);
          return;
        }
      }
      if (widget.classList.contains('visible')) {
        scheduleHide();
      }
    },
    { passive: true }
  );

  window.addEventListener('scroll', updateWidgetPosition, { passive: true, capture: true });
  window.addEventListener('resize', updateWidgetPosition, { passive: true });

  const observer = new MutationObserver(() => {
    document.querySelectorAll('video').forEach(bindVideoElement);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll('video').forEach(bindVideoElement);
})();
