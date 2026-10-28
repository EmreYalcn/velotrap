(function () {
  if (window.__IDM_PRO_PAGE_HOOK__) return;
  window.__IDM_PRO_PAGE_HOOK__ = true;

  const MEDIA_REGEX = /\.(m3u8|mp4|webm|mkv|mov|flv|mpd|m4a|mp3)(\?|$|#)/i;

  function reportStream(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return;
    try {
      const abs = new URL(rawUrl, window.location.href).toString();
      if (!abs.startsWith('http://') && !abs.startsWith('https://')) return;
      if (abs.includes('googlevideo.com/videoplayback')) return;
      if (MEDIA_REGEX.test(abs) || abs.toLowerCase().includes('m3u8') || abs.toLowerCase().includes('manifest')) {
        window.postMessage({ __idmProSniffedUrl: abs }, '*');
        if (window.top && window.top !== window) {
          try {
            window.top.postMessage({ __idmProSniffedUrl: abs }, '*');
          } catch {}
        }
      }
    } catch {}
  }

  // 1. Hook window.fetch
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input && input.url;
        if (url) reportStream(url);
      } catch {}
      return origFetch.apply(this, args);
    };
  }

  // 2. Hook XMLHttpRequest.prototype.open
  const origOpen = XMLHttpRequest.prototype.open;
  if (typeof origOpen === 'function') {
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        if (url) reportStream(String(url));
      } catch {}
      return origOpen.call(this, method, url, ...rest);
    };
  }
})();
