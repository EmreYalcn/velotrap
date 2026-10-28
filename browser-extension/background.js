const IDM_API_BASE = 'http://127.0.0.1:46890';

function syncLanguage(lang) {
  if (!lang) return;
  chrome.storage.local.get(['appLanguage'], (res) => {
    if (res.appLanguage !== lang) {
      chrome.storage.local.set({ appLanguage: lang });
    }
  });
}

function sendExtensionHeartbeat() {
  try {
    const manifest = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest() : null;
    fetch(`${IDM_API_BASE}/api/extension-heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        extensionId: chrome.runtime?.id || 'velotrap-extension',
        version: manifest?.version || '3.1.11',
        name: manifest?.name || 'Velotrap',
        timestamp: Date.now(),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.language) {
          syncLanguage(data.language);
        }
      })
      .catch(() => {});
  } catch {}
}

sendExtensionHeartbeat();
setInterval(sendExtensionHeartbeat, 3000);

// tabId -> Map<cleanUrl, StreamInfo>
const tabStreams = new Map();
// requestId -> Record<string, string>
const reqHeadersById = new Map();

function getTabStreamMap(tabId) {
  if (!tabStreams.has(tabId)) {
    tabStreams.set(tabId, new Map());
  }
  return tabStreams.get(tabId);
}

function updateBadge(tabId) {
  if (tabId < 0) return;
  const map = tabStreams.get(tabId);
  const count = map ? map.size : 0;
  chrome.action.setBadgeText({
    tabId,
    text: count > 0 ? String(count) : '',
  }).catch(() => {});
  if (count > 0) {
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: '#10b981',
    }).catch(() => {});
  }
}

function registerTabStream(tabId, url, ext, mimeType, sizeBytes, headers = {}) {
  if (tabId < 0 || !url) return;
  if (url.startsWith(IDM_API_BASE)) return;
  if (url.includes('googlevideo.com/videoplayback')) return;

  const cleanKey = url.replace(/[&?]range=[^&]+/gi, '');
  const map = getTabStreamMap(tabId);
  if (map.has(cleanKey)) return;

  const streamInfo = {
    url,
    ext: ext || (url.toLowerCase().includes('.m3u8') ? 'm3u8' : 'mp4'),
    mimeType: mimeType || 'video/mp4',
    sizeBytes: sizeBytes || 0,
    timestamp: Date.now(),
    headers,
  };

  map.set(cleanKey, streamInfo);
  updateBadge(tabId);

  chrome.tabs.sendMessage(tabId, {
    type: 'IDM_STREAMS_UPDATED',
    streams: Array.from(map.values()),
  }).catch(() => {});
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabStreams.delete(tabId);
    updateBadge(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStreams.delete(tabId);
});

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const headers = {};
    if (details.requestHeaders) {
      for (const h of details.requestHeaders) {
        if (h.name && h.value) {
          headers[h.name] = h.value;
        }
      }
    }
    reqHeadersById.set(details.requestId, headers);
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders']
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const reqHeaders = reqHeadersById.get(details.requestId) || {};
    reqHeadersById.delete(details.requestId);

    if (details.tabId < 0) return;
    const url = details.url || '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    if (url.startsWith(IDM_API_BASE)) return;

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }

    const pathname = parsed.pathname.toLowerCase();
    if (
      pathname.endsWith('.ts') ||
      pathname.endsWith('.m4s') ||
      pathname.endsWith('.vtt') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.gif') ||
      pathname.endsWith('.woff2') ||
      pathname.endsWith('.css') ||
      pathname.endsWith('.js') ||
      url.includes('googlevideo.com/videoplayback')
    ) {
      return;
    }

    const resHeaders = details.responseHeaders || [];
    const getHeader = (name) => {
      const found = resHeaders.find((h) => h.name.toLowerCase() === name.toLowerCase());
      return found ? found.value || '' : '';
    };

    const contentType = getHeader('content-type').toLowerCase();
    const contentLength = parseInt(getHeader('content-length') || '0', 10);

    const isM3u8 =
      pathname.endsWith('.m3u8') ||
      url.toLowerCase().includes('.m3u8') ||
      contentType.includes('mpegurl') ||
      contentType.includes('vnd.apple.mpegurl');

    const isMediaExt = /\.(mp4|webm|mkv|mov|flv|avi|mp3|m4a|wav|aac|ogg)$/i.test(pathname);
    const isMediaMime =
      contentType.startsWith('video/') ||
      contentType.startsWith('audio/') ||
      contentType.includes('dash+xml');

    if (!isM3u8 && !isMediaExt && !isMediaMime) return;
    if (!isM3u8 && contentLength > 0 && contentLength < 80 * 1024) return;

    let ext = 'mp4';
    if (isM3u8) ext = 'm3u8';
    else {
      const m = pathname.match(/\.([a-z0-9]+)$/i);
      if (m) ext = m[1].toLowerCase();
      else if (contentType.includes('webm')) ext = 'webm';
      else if (contentType.startsWith('audio/')) ext = 'mp3';
    }

    registerTabStream(
      details.tabId,
      url,
      ext,
      contentType || (isM3u8 ? 'application/x-mpegURL' : 'video/mp4'),
      isM3u8 ? 0 : contentLength,
      reqHeaders
    );
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

async function buildCookieHeaderForUrl(targetUrl) {
  try {
    if (!targetUrl || !targetUrl.startsWith('http')) return '';
    const cookies = await chrome.cookies.getAll({ url: targetUrl });
    if (!cookies || cookies.length === 0) return '';
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId ?? sender.tab?.id ?? -1;

  if (message.type === 'REPORT_SNIFFED_STREAM') {
    if (tabId >= 0 && message.url) {
      const u = String(message.url);
      const isM3u8 = u.toLowerCase().includes('.m3u8');
      registerTabStream(
        tabId,
        u,
        isM3u8 ? 'm3u8' : 'mp4',
        isM3u8 ? 'application/x-mpegURL' : 'video/mp4',
        0,
        { Referer: sender.tab?.url || u }
      );
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'GET_TAB_STREAMS') {
    const map = tabStreams.get(tabId);
    sendResponse({
      ok: true,
      streams: map ? Array.from(map.values()) : [],
    });
    return false;
  }

  if (message.type === 'CHECK_IDM_STATUS') {
    fetch(`${IDM_API_BASE}/api/status`)
      .then((r) => r.json())
      .then((data) => {
        const lang = data?.settings?.language || data?.language || 'tr';
        syncLanguage(lang);
        sendResponse({ ok: true, status: data, language: lang });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'FOCUS_IDM_APP') {
    fetch(`${IDM_API_BASE}/api/focus`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'ANALYZE_VIDEO') {
    (async () => {
      try {
        const targetUrl = message.url || sender.tab?.url || '';
        const cookieStr = await buildCookieHeaderForUrl(targetUrl);
        const headers = {
          Referer: message.pageUrl || sender.tab?.url || targetUrl,
          'User-Agent': navigator.userAgent,
          ...(message.headers || {}),
        };
        if (cookieStr) {
          headers['Cookie'] = cookieStr;
        }

        const map = tabStreams.get(tabId);
        const tabStreamList = map ? Array.from(map.values()) : [];
        const extraStreams = Array.isArray(message.extraStreams)
          ? message.extraStreams.map((u) => ({
              url: u,
              ext: u.toLowerCase().includes('.m3u8') ? 'm3u8' : 'mp4',
              headers,
            }))
          : [];

        const sniffedStreams = [...tabStreamList, ...extraStreams];

        const resp = await fetch(`${IDM_API_BASE}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: targetUrl,
            videoSrc: message.videoSrc || '',
            pageUrl: message.pageUrl || sender.tab?.url || targetUrl,
            title: message.title || sender.tab?.title || 'Video',
            headers,
            sniffedStreams,
          }),
        });

        const data = await resp.json();
        sendResponse(data);
      } catch (err) {
        sendResponse({
          ok: false,
          error:
            'Velotrap masaüstü uygulamasına bağlanılamadı. Lütfen Velotrap uygulamasının açık olduğundan emin olun.',
        });
      }
    })();
    return true;
  }

  if (message.type === 'START_DOWNLOAD') {
    (async () => {
      try {
        const targetUrl = message.url;
        const pageUrl = message.pageUrl || sender.tab?.url || targetUrl;
        const cookieTarget = await buildCookieHeaderForUrl(targetUrl);
        const cookiePage = await buildCookieHeaderForUrl(pageUrl);
        const combinedCookies = [cookieTarget, cookiePage].filter(Boolean).join('; ');

        const headers = {
          Referer: pageUrl,
          'User-Agent': navigator.userAgent,
          ...(message.headers || {}),
        };
        if (combinedCookies && !headers['Cookie']) {
          headers['Cookie'] = combinedCookies;
        }

        // Gather all captured stream URLs in this tab as fallback streams!
        const map = tabStreams.get(tabId);
        const tabStreamUrls = map ? Array.from(map.values()).map((s) => s.url) : [];
        const clientFallbackUrls = Array.isArray(message.fallbackStreamUrls)
          ? message.fallbackStreamUrls
          : [];
        const fallbackStreamUrls = Array.from(
          new Set([...clientFallbackUrls, ...tabStreamUrls].filter(Boolean))
        );

        const resp = await fetch(`${IDM_API_BASE}/api/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: targetUrl,
            fileName: message.fileName,
            connectionsCount: message.connectionsCount || 16,
            sourceType: message.sourceType || 'yt-dlp',
            videoFormatId: message.videoFormatId,
            videoResolution: message.videoResolution,
            totalBytes: message.totalBytes,
            pageUrl,
            fallbackStreamUrls,
            headers,
            focusWindow: Boolean(message.focusWindow),
            autoStart: true,
          }),
        });

        const data = await resp.json();
        sendResponse(data);
      } catch (err) {
        sendResponse({
          ok: false,
          error: 'Velotrap masaüstü uygulamasına ulaşılamadı.',
        });
      }
    })();
    return true;
  }

  return false;
});

async function injectIntoExistingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['page-hook.js'],
          world: 'MAIN',
        });
      } catch {
        // ignore restricted frames
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['content.js'],
        });
      } catch {
        // ignore restricted frames
      }
    }
  } catch {
    // ignore
  }
}

chrome.runtime.onInstalled.addListener(() => {
  injectIntoExistingTabs();
});

injectIntoExistingTabs();

