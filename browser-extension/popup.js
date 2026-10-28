const connStatus = document.getElementById('conn-status');
const tabTitleEl = document.getElementById('tab-title');
const customUrlInput = document.getElementById('custom-url-input');
const streamCountEl = document.getElementById('stream-count');
const analyzeBtn = document.getElementById('analyze-btn');
const quickMp3Btn = document.getElementById('quick-mp3-btn');
const modeTabs = document.getElementById('mode-tabs');
const tabVideoBtn = document.getElementById('tab-video');
const tabAudioBtn = document.getElementById('tab-audio');
const formatsContainer = document.getElementById('formats-container');
const sniffedContainer = document.getElementById('sniffed-container');
const openIdmBtn = document.getElementById('open-idm-btn');

let currentTab = null;
let loadedAnalysis = null;
let tabStreams = [];
let popupMode = 'video'; // 'video' | 'audio'
let currentLang = 'tr';

const I18N = {
  tr: {
    brandTitle: 'Velotrap Video & MP3 İndirici',
    checking: 'Kontrol ediliyor...',
    connected: '● Velotrap Bağlı',
    offline: '○ Velotrap Kapalı',
    activeTabCardTitle: 'AKTİF SEKME VİDEO & MP3 ANALİZİ',
    streamCount: '{count} Bağlantı',
    defaultTabTitle: 'Bağlantılar',
    pageLoading: 'Bağlantılar',
    urlPlaceholder: 'Sayfa linki veya dönüştürülecek YouTube/X linki...',
    analyzeBtn: '⚡ Kaliteleri Listele',
    analyzing: '⏳ Boyutlar Hesaplanıyor...',
    quickMp3Btn: '🎵 Direkt MP3 İndir',
    quickMp3Title: 'Linki doğrudan 320kbps MP3 olarak indir',
    downloading: '⏳ İndiriliyor...',
    modeTabVideo: '🎬 Video Olarak İndir',
    modeTabAudio: '🎵 MP3 / Sese Çevir',
    sniffedCardTitle: 'AĞDAN YAKALANAN MEDYA BAĞLANTILARI (.M3U8 / .MP4)',
    sniffedEmpty: 'Sayfada video oynatıldığında medya bağlantıları (.m3u8 ve .mp4) otomatik yakalanır.',
    noFormats: 'Format bulunamadı.',
    footerText: '16x Çoklu Parça & FFmpeg MP3 Motoru',
    openIdmBtn: "Velotrap Masaüstü'nü Aç ↗",
    openIdmBtnLoading: '⏳ Velotrap Açılıyor...',
    hlsStreamPrefix: 'HLS Video Bağlantısı #',
    directMediaPrefix: 'Doğrudan Medya Bağlantısı #',
    download: 'İndir',
    ready: 'Hazır',
    autoBadge: 'OTO',
    bestQualityTag: 'EnYuksekKalite',
    // Presets
    pBestRes: 'En Yüksek Kalite (Otomatik)',
    pBestNote: 'Mevcut en yüksek çözünürlüğü otomatik indirir',
    pFhdRes: '1080p Full HD',
    pFhdNote: 'MP4 • Yüksek Kalite (Yoksa en yakın üst kalite)',
    pHdRes: '720p HD',
    pHdNote: 'MP4 • Standart HD Kalite',
    pSdRes: '480p SD',
    pSdNote: 'MP4 • Dengeli Boyut',
    pLowRes: '360p Düşük Veri',
    pLowNote: 'MP4 • Hızlı İndirme',
    pMp3StudioRes: 'MP3 Ses (320 kbps Stüdyo Kalitesi)',
    pMp3StudioNote: 'En yüksek ses kalitesi • Otomatik MP3 Dönüştürücü',
    pMp3StdRes: 'MP3 Ses (192 kbps Standart)',
    pMp3StdNote: 'Dengeli boyut ve kalite • MP3 Dönüştürücü',
    pM4aRes: 'M4A / AAC Ses (256 kbps)',
    pM4aNote: 'Apple / Mobil uyumlu orijinal ses',
    pWavRes: 'WAV Kayıpsız Ses (Lossless)',
    pWavNote: 'Sıkıştırmasız stüdyo formatı',
  },
  en: {
    brandTitle: 'Velotrap Video & MP3 Downloader',
    checking: 'Checking...',
    connected: '● Velotrap Connected',
    offline: '○ Velotrap Disconnected',
    activeTabCardTitle: 'ACTIVE TAB VIDEO & MP3 ANALYSIS',
    streamCount: '{count} Links',
    defaultTabTitle: 'Links',
    pageLoading: 'Links',
    urlPlaceholder: 'Page link or YouTube/X link to convert...',
    analyzeBtn: '⚡ List Qualities',
    analyzing: '⏳ Calculating Sizes...',
    quickMp3Btn: '🎵 Direct MP3 Download',
    quickMp3Title: 'Download link directly as 320kbps MP3',
    downloading: '⏳ Downloading...',
    modeTabVideo: '🎬 Download as Video',
    modeTabAudio: '🎵 Convert to MP3 / Audio',
    sniffedCardTitle: 'NETWORK CAPTURED MEDIA LINKS (.M3U8 / .MP4)',
    sniffedEmpty: 'Media links (.m3u8 and .mp4) will appear here automatically when video is played.',
    noFormats: 'No formats found.',
    footerText: '16x Multi-Stream & FFmpeg MP3 Engine',
    openIdmBtn: 'Open Velotrap Desktop ↗',
    openIdmBtnLoading: '⏳ Opening Velotrap...',
    hlsStreamPrefix: 'HLS Video Link #',
    directMediaPrefix: 'Direct Media Link #',
    download: 'Download',
    ready: 'Ready',
    autoBadge: 'AUTO',
    bestQualityTag: 'BestQuality',
    // Presets
    pBestRes: 'Highest Quality (Auto)',
    pBestNote: 'Automatically downloads highest available resolution',
    pFhdRes: '1080p Full HD',
    pFhdNote: 'MP4 • High Quality (or closest available)',
    pHdRes: '720p HD',
    pHdNote: 'MP4 • Standard HD Quality',
    pSdRes: '480p SD',
    pSdNote: 'MP4 • Balanced Size',
    pLowRes: '360p Data Saver',
    pLowNote: 'MP4 • Fast Download',
    pMp3StudioRes: 'MP3 Audio (320 kbps Studio Quality)',
    pMp3StudioNote: 'Highest audio quality • Automatic MP3 Converter',
    pMp3StdRes: 'MP3 Audio (192 kbps Standard)',
    pMp3StdNote: 'Balanced size and quality • MP3 Converter',
    pM4aRes: 'M4A / AAC Audio (256 kbps)',
    pM4aNote: 'Apple / Mobile compatible original audio',
    pWavRes: 'WAV Lossless Audio',
    pWavNote: 'Uncompressed studio format',
  },
};

function t(key, vars) {
  const dict = I18N[currentLang] || I18N.tr;
  let text = dict[key] || I18N.tr[key] || '';
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

function getDisplayTabTitle(tab) {
  if (!tab || !tab.url || !tab.url.startsWith('http')) {
    return t('defaultTabTitle');
  }
  const rawTitle = (tab.title || '').trim();
  if (
    !rawTitle ||
    /^(uzantılar|uzantilar|extensions|extension|yeni sekme|new tab|settings|ayarlar)$/i.test(rawTitle) ||
    rawTitle.toLowerCase().includes('uzantı') ||
    rawTitle.toLowerCase().includes('extension')
  ) {
    return t('defaultTabTitle');
  }
  return rawTitle;
}

function updatePopupLanguage(lang) {
  if (lang && (lang === 'tr' || lang === 'en')) {
    currentLang = lang;
  }
  const brandSpan = document.getElementById('popup-brand-title');
  if (brandSpan) brandSpan.textContent = t('brandTitle');

  const card1Title = document.getElementById('card-title-active');
  if (card1Title) card1Title.textContent = t('activeTabCardTitle');

  const card2Title = document.getElementById('card-title-sniffed');
  if (card2Title) card2Title.textContent = t('sniffedCardTitle');

  if (tabTitleEl) {
    tabTitleEl.textContent = getDisplayTabTitle(currentTab);
  }

  if (customUrlInput) customUrlInput.placeholder = t('urlPlaceholder');
  if (analyzeBtn && !analyzeBtn.disabled) analyzeBtn.textContent = t('analyzeBtn');
  if (quickMp3Btn && !quickMp3Btn.disabled) {
    quickMp3Btn.textContent = t('quickMp3Btn');
    quickMp3Btn.title = t('quickMp3Title');
  }
  if (tabVideoBtn) tabVideoBtn.textContent = t('modeTabVideo');
  if (tabAudioBtn) tabAudioBtn.textContent = t('modeTabAudio');

  const footerSpan = document.getElementById('footer-engine-text');
  if (footerSpan) footerSpan.textContent = t('footerText');
  if (openIdmBtn && !openIdmBtn.disabled) openIdmBtn.textContent = t('openIdmBtn');

  if (connStatus) {
    const isOffline = connStatus.classList.contains('offline');
    connStatus.textContent = isOffline ? t('offline') : t('connected');
  }

  if (tabStreams) {
    streamCountEl.textContent = t('streamCount', { count: tabStreams.length });
  }

  if (currentTab && currentTab.url && loadedAnalysis?.extractor === 'instant') {
    loadedAnalysis = buildInstantPopupAnalysis(currentTab.url, currentTab.title);
    renderLoadedFormats();
  }
  if (tabStreams) {
    renderSniffedStreams(tabStreams);
  }
}

// Storage sync listener for real-time updates
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.appLanguage) {
      updatePopupLanguage(changes.appLanguage.newValue);
    }
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return t('ready');
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function buildInstantPopupAnalysis(url, title) {
  return {
    title: title || 'Video',
    url,
    extractor: 'instant',
    formats: [
      {
        formatId: 'best',
        ext: 'mp4',
        resolution: t('pBestRes'),
        note: t('pBestNote'),
        isAudioOnly: false,
      },
      {
        formatId: 'height:1080',
        ext: 'mp4',
        resolution: t('pFhdRes'),
        note: t('pFhdNote'),
        isAudioOnly: false,
      },
      {
        formatId: 'height:720',
        ext: 'mp4',
        resolution: t('pHdRes'),
        note: t('pHdNote'),
        isAudioOnly: false,
      },
      {
        formatId: 'height:480',
        ext: 'mp4',
        resolution: t('pSdRes'),
        note: t('pSdNote'),
        isAudioOnly: false,
      },
      {
        formatId: 'height:360',
        ext: 'mp4',
        resolution: t('pLowRes'),
        note: t('pLowNote'),
        isAudioOnly: false,
      },
      {
        formatId: 'audio:mp3:320',
        ext: 'mp3',
        resolution: t('pMp3StudioRes'),
        note: t('pMp3StudioNote'),
        isAudioOnly: true,
      },
      {
        formatId: 'audio:mp3:192',
        ext: 'mp3',
        resolution: t('pMp3StdRes'),
        note: t('pMp3StdNote'),
        isAudioOnly: true,
      },
      {
        formatId: 'audio:m4a:256',
        ext: 'm4a',
        resolution: t('pM4aRes'),
        note: t('pM4aNote'),
        isAudioOnly: true,
      },
      {
        formatId: 'audio:wav:0',
        ext: 'wav',
        resolution: t('pWavRes'),
        note: t('pWavNote'),
        isAudioOnly: true,
      },
    ],
  };
}

if (openIdmBtn) {
  openIdmBtn.addEventListener('click', async () => {
    const originalText = openIdmBtn.textContent;
    openIdmBtn.textContent = t('openIdmBtnLoading');
    openIdmBtn.disabled = true;

    try {
      await fetch('http://127.0.0.1:46890/api/focus', { method: 'POST' });
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'FOCUS_IDM_APP' });
    }

    setTimeout(() => {
      openIdmBtn.textContent = originalText;
      openIdmBtn.disabled = false;
      window.close();
    }, 600);
  });
}

tabVideoBtn.addEventListener('click', () => {
  popupMode = 'video';
  tabVideoBtn.classList.add('active-video');
  tabAudioBtn.classList.remove('active-audio');
  if (loadedAnalysis) renderLoadedFormats();
});

tabAudioBtn.addEventListener('click', () => {
  popupMode = 'audio';
  tabVideoBtn.classList.remove('active-video');
  tabAudioBtn.classList.add('active-audio');
  if (loadedAnalysis) renderLoadedFormats();
});

async function initPopup() {
  const manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : null;
  const verBadge = document.getElementById('ext-version-badge');
  if (verBadge && manifest && manifest.version) {
    verBadge.textContent = `v${manifest.version}`;
  }

  // Load saved language preference first
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['appLanguage'], (stored) => {
      if (stored && stored.appLanguage) {
        updatePopupLanguage(stored.appLanguage);
      }
    });
  }

  chrome.runtime.sendMessage({ type: 'CHECK_IDM_STATUS' }, (res) => {
    if (res && res.ok) {
      connStatus.classList.remove('offline');
      if (res.language) {
        updatePopupLanguage(res.language);
      } else {
        connStatus.textContent = t('connected');
      }
      if (res.version && verBadge) {
        verBadge.textContent = `v${res.version}`;
      }
    } else {
      connStatus.textContent = t('offline');
      connStatus.classList.add('offline');
    }
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    if (tabTitleEl) tabTitleEl.textContent = t('defaultTabTitle');
    return;
  }
  currentTab = tab;
  if (tabTitleEl) {
    tabTitleEl.textContent = getDisplayTabTitle(tab);
  }
  if (tab.url && tab.url.startsWith('http')) {
    customUrlInput.value = tab.url;
    loadedAnalysis = buildInstantPopupAnalysis(tab.url, tab.title);
    modeTabs.classList.add('visible');
    renderLoadedFormats();
  }

  chrome.runtime.sendMessage({ type: 'GET_TAB_STREAMS', tabId: tab.id }, (res) => {
    tabStreams = (res && res.streams) || [];
    streamCountEl.textContent = t('streamCount', { count: tabStreams.length });
    renderSniffedStreams(tabStreams);
  });
}

function renderSniffedStreams(streams) {
  if (!streams || streams.length === 0) {
    sniffedContainer.innerHTML = `<div class="muted">${t('sniffedEmpty')}</div>`;
    return;
  }

  sniffedContainer.innerHTML = '';
  streams.forEach((s, idx) => {
    const row = document.createElement('button');
    row.className = 'fmt-row';
    const isHls = s.ext === 'm3u8' || s.url.includes('.m3u8');
    row.innerHTML = `
      <span class="badge">${(s.ext || 'mp4').toUpperCase()}</span>
      <div class="fmt-mid">
        <strong>${isHls ? t('hlsStreamPrefix') + (idx + 1) : t('directMediaPrefix') + (idx + 1)}</strong>
        <span>${s.url.slice(0, 48)}...</span>
      </div>
      <span class="fmt-right">${s.sizeBytes > 0 ? formatBytes(s.sizeBytes) : t('download')}</span>
    `;
    row.addEventListener('click', () => {
      const safeTitle = (currentTab?.title || 'video').replace(/[<>:"/\\|?*]/g, '_').slice(0, 70);
      chrome.runtime.sendMessage(
        {
          type: 'START_DOWNLOAD',
          tabId: currentTab?.id,
          url: s.url,
          fileName: `${safeTitle}.${isHls ? 'mp4' : s.ext || 'mp4'}`,
          connectionsCount: 16,
          sourceType: isHls ? 'hls' : 'direct',
          totalBytes: s.sizeBytes || undefined,
          pageUrl: currentTab?.url,
          headers: s.headers || {},
          fallbackStreamUrls: streams.map((item) => item.url),
          focusWindow: true,
        },
        () => window.close()
      );
    });
    sniffedContainer.appendChild(row);
  });
}

function renderLoadedFormats() {
  if (!loadedAnalysis) return;
  formatsContainer.innerHTML = '';
  const all = loadedAnalysis.formats || [];
  const filtered = all.filter((f) =>
    popupMode === 'audio' ? Boolean(f.isAudioOnly) : !f.isAudioOnly
  );

  if (filtered.length === 0) {
    formatsContainer.innerHTML = `<div class="muted">${t('noFormats')}</div>`;
    return;
  }

  filtered.forEach((fmt) => {
    const row = document.createElement('button');
    const isBest = fmt.formatId === 'best' || fmt.formatId === 'hls_best';
    const isAudio = Boolean(fmt.isAudioOnly);
    row.className = `fmt-row ${isBest ? 'best' : ''}`;
    row.innerHTML = `
      <span class="badge ${isAudio ? 'audio' : isBest ? 'best' : ''}">
        ${isBest ? t('autoBadge') : (fmt.ext || 'mp4').toUpperCase()}
      </span>
      <div class="fmt-mid">
        <strong>${fmt.resolution}</strong>
        <span>${fmt.note || ''}</span>
      </div>
      <span class="fmt-right">${formatBytes(fmt.filesize)}</span>
    `;
    row.addEventListener('click', () => {
      const ext = fmt.ext || (isAudio ? 'mp3' : 'mp4');
      const cleanTitle = (loadedAnalysis.title || currentTab?.title || 'video')
        .replace(/^\s*[\(\[]\d+[\)\]]\s*/, '')
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim()
        .slice(0, 75);
      const shortRes = isAudio
        ? ext.toUpperCase()
        : isBest
        ? t('bestQualityTag')
        : (fmt.resolution || '').split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
      const fileName = `${cleanTitle}${shortRes ? '_' + shortRes : ''}.${ext}`;

      const targetUrl = fmt.streamUrl || loadedAnalysis.url || currentTab?.url;
      let sourceType = 'yt-dlp';
      if (fmt.protocol === 'm3u8' || targetUrl.includes('.m3u8')) {
        sourceType = 'hls';
      } else if (fmt.protocol === 'https' && fmt.streamUrl) {
        sourceType = 'direct';
      }

      chrome.runtime.sendMessage(
        {
          type: 'START_DOWNLOAD',
          tabId: currentTab?.id,
          url: targetUrl,
          fileName,
          connectionsCount: 16,
          sourceType,
          videoFormatId: fmt.formatId,
          videoResolution: fmt.resolution,
          totalBytes: fmt.filesize,
          pageUrl: currentTab?.url || targetUrl,
          headers: loadedAnalysis.headers || {},
          fallbackStreamUrls: tabStreams.map((s) => s.url),
          focusWindow: true,
        },
        () => window.close()
      );
    });
    formatsContainer.appendChild(row);
  });
}

analyzeBtn.addEventListener('click', () => {
  const targetUrl = (customUrlInput.value || currentTab?.url || '').trim();
  if (!targetUrl) return;
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = t('analyzing');

  if (!loadedAnalysis || loadedAnalysis.url !== targetUrl) {
    loadedAnalysis = buildInstantPopupAnalysis(targetUrl, currentTab?.title || 'Video');
    modeTabs.classList.add('visible');
    renderLoadedFormats();
  }

  chrome.runtime.sendMessage(
    {
      type: 'ANALYZE_VIDEO',
      tabId: currentTab?.id,
      url: targetUrl,
      pageUrl: currentTab?.url || targetUrl,
      title: currentTab?.title || 'Video',
    },
    (res) => {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = t('analyzeBtn');

      if (res && res.ok && res.analysis && res.analysis.formats?.length > 0) {
        loadedAnalysis = res.analysis;
        modeTabs.classList.add('visible');
        renderLoadedFormats();
      }
    }
  );
});

quickMp3Btn.addEventListener('click', () => {
  const targetUrl = (customUrlInput.value || currentTab?.url || '').trim();
  if (!targetUrl) return;
  quickMp3Btn.disabled = true;
  quickMp3Btn.textContent = t('downloading');

  const safeTitle = (currentTab?.title || 'audio_track')
    .replace(/[<>:"/\\|?*]/g, '_')
    .slice(0, 75);

  chrome.runtime.sendMessage(
    {
      type: 'START_DOWNLOAD',
      tabId: currentTab?.id,
      url: targetUrl,
      fileName: `${safeTitle}_320kbps.mp3`,
      connectionsCount: 16,
      sourceType: 'yt-dlp',
      videoFormatId: 'audio:mp3:320',
      videoResolution: t('pMp3StudioRes'),
      pageUrl: currentTab?.url || targetUrl,
      fallbackStreamUrls: tabStreams.map((s) => s.url),
      focusWindow: true,
    },
    () => window.close()
  );
});

initPopup();
