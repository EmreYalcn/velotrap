import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { spawn } from 'child_process';
import { DownloadEngine } from './downloadEngine';
import { VideoAnalysisResult, VideoFormatOption } from './types';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface ConversionResult {
  ok: boolean;
  outputPath: string;
  sizeBytes: number;
}

export class VideoEngine {
  private downloadEngine: DownloadEngine;
  private binDir: string;

  constructor(downloadEngine: DownloadEngine, stateDir: string) {
    this.downloadEngine = downloadEngine;
    this.binDir = path.join(stateDir, 'bin');
    fs.mkdirSync(this.binDir, { recursive: true });

    const localYtDlp = path.join(this.binDir, 'yt-dlp');
    if (fs.existsSync(localYtDlp) && !this.downloadEngine.getSettings().ytDlpPath) {
      this.downloadEngine.updateSettings({ ytDlpPath: localYtDlp });
    }
  }

  public getEngineStatus(): {
    ytDlpInstalled: boolean;
    ytDlpPath: string | null;
    ffmpegInstalled: boolean;
    ffmpegPath: string | null;
  } {
    const ytDlpPath = this.downloadEngine.resolveYtDlpBinary();
    const ffmpegCandidates = [
      this.downloadEngine.getSettings().ffmpegPath,
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
    ].filter(Boolean);
    const ffmpegPath = ffmpegCandidates.find((p) => fs.existsSync(p)) || null;

    return {
      ytDlpInstalled: Boolean(ytDlpPath),
      ytDlpPath,
      ffmpegInstalled: Boolean(ffmpegPath),
      ffmpegPath,
    };
  }

  /**
   * Converts any local video/audio file to MP3, M4A, WAV, or H.264 MP4 using FFmpeg
   */
  public async convertLocalMedia(
    inputPath: string,
    targetFormat: 'mp3-320' | 'mp3-192' | 'm4a' | 'wav' | 'mp4-h264',
    onProgress?: (pct: number) => void
  ): Promise<ConversionResult> {
    const status = this.getEngineStatus();
    if (!status.ffmpegPath) {
      throw new Error('FFmpeg bulunamadı (/opt/homebrew/bin/ffmpeg).');
    }
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Kaynak dosya bulunamadı: ${inputPath}`);
    }

    const dir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    let outExt = 'mp3';
    let args: string[] = ['-y', '-i', inputPath];

    if (targetFormat === 'mp3-320') {
      outExt = 'mp3';
      args.push('-vn', '-acodec', 'libmp3lame', '-b:a', '320k');
    } else if (targetFormat === 'mp3-192') {
      outExt = 'mp3';
      args.push('-vn', '-acodec', 'libmp3lame', '-b:a', '192k');
    } else if (targetFormat === 'm4a') {
      outExt = 'm4a';
      args.push('-vn', '-c:a', 'aac', '-b:a', '256k');
    } else if (targetFormat === 'wav') {
      outExt = 'wav';
      args.push('-vn', '-acodec', 'pcm_s16le');
    } else if (targetFormat === 'mp4-h264') {
      outExt = 'mp4';
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-b:a', '192k');
    }

    let outputPath = path.join(dir, `${baseName}_converted.${outExt}`);
    if (outputPath === inputPath) {
      outputPath = path.join(dir, `${baseName}_${Date.now()}.${outExt}`);
    }
    args.push(outputPath);

    return new Promise((resolve, reject) => {
      const proc = spawn(status.ffmpegPath!, args);
      let durationSec = 0;

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (durMatch) {
          durationSec =
            parseInt(durMatch[1], 10) * 3600 +
            parseInt(durMatch[2], 10) * 60 +
            parseFloat(durMatch[3]);
        }
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (timeMatch && durationSec > 0) {
          const cur =
            parseInt(timeMatch[1], 10) * 3600 +
            parseInt(timeMatch[2], 10) * 60 +
            parseFloat(timeMatch[3]);
          const pct = Math.min(99, Math.round((cur / durationSec) * 100));
          onProgress?.(pct);
        }
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          onProgress?.(100);
          const stat = fs.statSync(outputPath);
          resolve({
            ok: true,
            outputPath,
            sizeBytes: stat.size,
          });
        } else {
          reject(new Error(`FFmpeg dönüştürme hatası (kod: ${code})`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Downloads the official standalone yt-dlp macOS universal binary into stateDir/bin/yt-dlp
   */
  public async installYtDlpBinary(
    onProgress?: (pct: number, statusText: string) => void
  ): Promise<string> {
    const targetPath = path.join(this.binDir, 'yt-dlp');
    const releaseUrl =
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';

    onProgress?.(5, 'Resmi yt-dlp_macos sürümü GitHub üzerinden indiriliyor...');
    await this.downloadFileWithRedirects(releaseUrl, targetPath, (downloaded, total) => {
      const pct = total > 0 ? Math.min(95, Math.round((downloaded / total) * 95)) : 50;
      onProgress?.(pct, `yt-dlp indiriliyor (%${pct})...`);
    });

    fs.chmodSync(targetPath, 0o755);
    this.downloadEngine.updateSettings({ ytDlpPath: targetPath });
    onProgress?.(100, 'yt-dlp video motoru başarıyla kuruldu!');
    return targetPath;
  }

  /**
   * Analyzes any URL (YouTube, Vimeo, TikTok, X, HLS .m3u8, direct .mp4, or generic web page with embedded video)
   */
  public async analyzeUrl(
    targetUrl: string,
    customHeaders: Record<string, string> = {}
  ): Promise<VideoAnalysisResult> {
    const trimmed = targetUrl.trim();
    const parsed = new URL(trimmed);
    const pathnameLower = parsed.pathname.toLowerCase();

    // 1. Direct HLS (.m3u8) stream check
    if (pathnameLower.endsWith('.m3u8') || trimmed.includes('.m3u8?')) {
      return this.analyzeHlsUrl(trimmed, customHeaders);
    }

    // 2. Direct Media File (.mp4, .webm, .mkv, .mov, .mp3, .m4a, .flv, or TikTok/CDN stream)
    if (
      /\.(mp4|webm|mkv|mov|avi|flv|mp3|m4a|wav|aac)$/i.test(pathnameLower) ||
      /[\?&]mime_type=(?:video|audio)/i.test(trimmed) ||
      trimmed.includes('/video/tos/') ||
      trimmed.includes('.tiktokcdn.com/') ||
      trimmed.includes('.byteoversea.com/') ||
      trimmed.includes('.ibytedtos.com/')
    ) {
      const probe = await this.downloadEngine.probeUrl(trimmed, customHeaders);
      const ext = path.extname(probe.fileName).replace('.', '') || 'mp4';
      return {
        url: probe.finalUrl,
        title: path.basename(probe.fileName, path.extname(probe.fileName)),
        extractor: 'direct-media',
        headers: customHeaders,
        formats: [
          {
            formatId: 'direct-source',
            ext,
            resolution: 'En Yüksek Kalite (Orijinal Dosya)',
            filesize: probe.totalBytes || undefined,
            note: probe.resumable
              ? 'Çoklu Bağlantı (16 Parça) Hızlandırma Destekli'
              : 'Doğrudan Akış',
            isAudioOnly: probe.category === 'music',
            needsMerge: false,
            streamUrl: probe.finalUrl,
            protocol: 'https',
          },
          ...this.getStandardAudioConversionFormats(probe.totalBytes),
        ],
      };
    }

    // 3. Try yt-dlp if installed
    const ytDlpBin = this.downloadEngine.resolveYtDlpBinary();
    if (ytDlpBin) {
      try {
        const ytResult = await this.analyzeWithYtDlp(ytDlpBin, trimmed, customHeaders);
        if (ytResult.formats.length > 0) {
          return ytResult;
        }
      } catch (err) {
        console.warn('yt-dlp analysis failed, falling back to HTML scraper:', err);
      }
    }

    // 4. Fallback: Native HTML & Embedded Media Scraper (.m3u8 / .mp4 / og:video / JSON-LD)
    return this.analyzeHtmlPageForVideos(trimmed, customHeaders);
  }

  private getStandardAudioConversionFormats(approxVideoBytes?: number): VideoFormatOption[] {
    const estMp3Size = approxVideoBytes ? Math.round(approxVideoBytes * 0.18) : undefined;
    return [
      {
        formatId: 'audio:mp3:320',
        ext: 'mp3',
        resolution: 'MP3 Ses (320 kbps Stüdyo Kalitesi)',
        filesize: estMp3Size,
        note: 'Videodan MP3 Sese Dönüştür (FFmpeg LAME 320k)',
        isAudioOnly: true,
        needsMerge: true,
        protocol: 'yt-dlp',
      },
      {
        formatId: 'audio:mp3:192',
        ext: 'mp3',
        resolution: 'MP3 Ses (192 kbps Standart)',
        filesize: estMp3Size ? Math.round(estMp3Size * 0.65) : undefined,
        note: 'Videodan MP3 Sese Dönüştür (Hızlı & Kompakt)',
        isAudioOnly: true,
        needsMerge: true,
        protocol: 'yt-dlp',
      },
      {
        formatId: 'audio:m4a:256',
        ext: 'm4a',
        resolution: 'M4A / AAC Ses (256 kbps Apple/Mobil)',
        filesize: estMp3Size ? Math.round(estMp3Size * 0.8) : undefined,
        note: 'Kayıpsız AAC Ses Akışı Çıkarıcı',
        isAudioOnly: true,
        needsMerge: true,
        protocol: 'yt-dlp',
      },
      {
        formatId: 'audio:wav:0',
        ext: 'wav',
        resolution: 'WAV Ses (Sıkıştırmasız PCM Kayıpsız)',
        note: 'Sıkıştırmasız Stüdyo WAV Dönüştürücü',
        isAudioOnly: true,
        needsMerge: true,
        protocol: 'yt-dlp',
      },
    ];
  }

  private getQualityBadgeText(height: number): string {
    if (height >= 2160) return `${height}p 4K Ultra HD`;
    if (height >= 1440) return `${height}p 2K QHD`;
    if (height >= 1080) return `${height}p Full HD`;
    if (height >= 720) return `${height}p HD`;
    if (height >= 480) return `${height}p SD`;
    return `${height}p`;
  }

  private async analyzeHlsUrl(
    m3u8Url: string,
    headers: Record<string, string>
  ): Promise<VideoAnalysisResult> {
    const content = await this.fetchText(m3u8Url, headers);
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    const variantList: {
      height: number;
      res: string;
      fps?: number;
      kbps?: number;
      codecs: string;
      url: string;
    }[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        const resMatch = lines[i].match(/RESOLUTION=(\d+)x(\d+)/i);
        const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/i);
        const fpsMatch = lines[i].match(/FRAME-RATE=([\d.]+)/i);
        const codecsMatch = lines[i].match(/CODECS="([^"]+)"/i);

        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith('#')) {
          const variantUrl = new URL(nextLine, m3u8Url).toString();
          const w = resMatch ? parseInt(resMatch[1], 10) : 0;
          const h = resMatch ? parseInt(resMatch[2], 10) : 0;
          // Handle vertical videos (e.g., 720x1280 on Shorts/TikTok/X) by taking the smaller dimension as quality label or height
          const normH = w > 0 && h > 0 ? Math.min(w, h) : h;
          const res = resMatch ? `${w}x${h}` : 'HLS';
          const kbps = bwMatch ? Math.round(parseInt(bwMatch[1], 10) / 1000) : undefined;

          variantList.push({
            height: normH,
            res,
            fps: fpsMatch ? Math.round(parseFloat(fpsMatch[1])) : undefined,
            kbps,
            codecs: codecsMatch ? codecsMatch[1] : 'h264',
            url: variantUrl,
          });
        }
      }
    }

    // Sort highest quality first
    variantList.sort((a, b) => b.height - a.height || (b.kbps || 0) - (a.kbps || 0));

    const formats: VideoFormatOption[] = [];
    if (variantList.length > 0) {
      const top = variantList[0];
      const topLabel = top.height > 0 ? this.getQualityBadgeText(top.height) : 'Orijinal';

      // 1. Add automatic Best Quality option pointing to the highest actual variant in the stream
      formats.push({
        formatId: 'hls_best',
        ext: 'mp4',
        resolution: `En Yüksek Kalite (Mevcut: ${topLabel})`,
        fps: top.fps,
        tbr: top.kbps,
        vcodec: top.codecs,
        note: `Videodaki En Üst Kaliteyi Otomatik İndir (${top.res})`,
        isAudioOnly: false,
        needsMerge: true,
        streamUrl: top.url,
        protocol: 'm3u8',
      });

      // 2. Add each distinct available resolution from the stream
      const seenHeights = new Set<number>();
      for (const v of variantList) {
        const key = v.height || v.kbps || 0;
        if (seenHeights.has(key)) continue;
        seenHeights.add(key);

        const label = v.height > 0 ? this.getQualityBadgeText(v.height) : 'HLS Akışı';
        formats.push({
          formatId: `hls_${key}`,
          ext: 'mp4',
          resolution: `${label} (${v.res})`,
          fps: v.fps,
          tbr: v.kbps,
          vcodec: v.codecs,
          note: v.kbps ? `HLS Akışı (~${v.kbps} kbps) • FFmpeg MP4` : 'HLS Akışı',
          isAudioOnly: false,
          needsMerge: true,
          streamUrl: v.url,
          protocol: 'm3u8',
        });
      }
    } else {
      formats.push({
        formatId: 'hls_master',
        ext: 'mp4',
        resolution: 'En Yüksek Kalite (Orijinal HLS Akışı)',
        note: 'Çoklu Parça HLS Birleştirme (FFmpeg MP4)',
        isAudioOnly: false,
        needsMerge: true,
        streamUrl: m3u8Url,
        protocol: 'm3u8',
      });
    }

    const baseName =
      path.basename(new URL(m3u8Url).pathname, '.m3u8') || `hls_video_${Date.now()}`;

    return {
      url: m3u8Url,
      title: decodeURIComponent(baseName),
      extractor: 'hls-native',
      headers,
      formats,
    };
  }

  private analyzeWithYtDlp(
    ytDlpBin: string,
    targetUrl: string,
    headers: Record<string, string>,
    useCustomHeaders = false
  ): Promise<VideoAnalysisResult> {
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-single-json',
        '--no-playlist',
        '--no-warnings',
        '--no-check-certificates',
        '--geo-bypass',
      ];

      // YouTube Anti-Bot Shield (Modern player client cascade: default, tv, web)
      if (this.downloadEngine.getSettings().youtubeAntiBot !== false) {
        args.push(
          '--extractor-args',
          'youtube:player_client=default,tv,web'
        );
      }

      const cookiesBrowser = this.downloadEngine.getSettings().youtubeBrowserCookies;
      if (cookiesBrowser && cookiesBrowser !== 'none') {
        args.push('--cookies-from-browser', cookiesBrowser);
      }

      const nodeBin = this.downloadEngine.resolveNodeBinary();
      if (nodeBin) {
        args.push('--js-runtimes', `node:${nodeBin}`);
      }

      const pluginDirs = [
        path.join(os.homedir(), '.config', 'yt-dlp', 'plugins'),
      ].filter((p) => fs.existsSync(p));
      for (const p of pluginDirs) {
        args.push('--plugin-dirs', p);
      }
      if (useCustomHeaders) {
        for (const [k, v] of Object.entries(headers)) {
          if (v) args.push('--add-header', `${k}:${v}`);
        }
      }
      args.push(targetUrl);

      const proc = spawn(ytDlpBin, args, {
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`,
        },
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

      proc.on('close', (code) => {
        if (code !== 0 || !stdout.trim()) {
          if (
            !useCustomHeaders &&
            Object.keys(headers).length > 0 &&
            !/youtube\.com|youtu\.be|x\.com|twitter\.com/i.test(targetUrl)
          ) {
            this.analyzeWithYtDlp(ytDlpBin, targetUrl, headers, true)
              .then(resolve)
              .catch(reject);
            return;
          }
          reject(new Error(stderr.trim() || `yt-dlp exit ${code}`));
          return;
        }

        try {
          const info = JSON.parse(stdout);
          const rawFormats: any[] = Array.isArray(info.formats) ? info.formats : [];

          // Find best audio size to estimate combined file sizes accurately
          const audioFormats = rawFormats.filter(
            (f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
          );
          const bestAudioSize = audioFormats.reduce(
            (max, f) => Math.max(max, Number(f.filesize || f.filesize_approx || 0)),
            0
          );

          // Collect all real video formats that actually exist in this video
          const videoFormats = rawFormats
            .filter((f) => {
              if (f.vcodec === 'none') return false;
              const h = Number(f.height || 0);
              const w = Number(f.width || 0);
              return h > 0 || w > 0 || (f.ext && ['mp4', 'webm', 'mkv', 'mov'].includes(f.ext));
            })
            .sort((a, b) => {
              const hA = Number(a.height || 0);
              const hB = Number(b.height || 0);
              if (hB !== hA) return hB - hA;
              // Prefer H.264 (avc1) over vp9/av01 at the same resolution for universal player compatibility
              const aIsH264 = String(a.vcodec || '').startsWith('avc1') ? 1 : 0;
              const bIsH264 = String(b.vcodec || '').startsWith('avc1') ? 1 : 0;
              if (bIsH264 !== aIsH264) return bIsH264 - aIsH264;
              return (Number(b.tbr) || 0) - (Number(a.tbr) || 0);
            });

          // Group by actual available resolution height (descending)
          const distinctByHeight = new Map<number, any>();
          for (const f of videoFormats) {
            const h = Number(f.height || 0);
            if (h > 0 && !distinctByHeight.has(h)) {
              distinctByHeight.set(h, f);
            }
          }

          const availableHeights = Array.from(distinctByHeight.keys()).sort((a, b) => b - a);
          const maxActualHeight = availableHeights[0] || Number(info.height || 0);
          const maxQualityText =
            maxActualHeight > 0
              ? this.getQualityBadgeText(maxActualHeight)
              : 'Orijinal Kalite';

          const topFormatObj =
            (maxActualHeight > 0 && distinctByHeight.get(maxActualHeight)) || videoFormats[0];
          const topEstSize = topFormatObj
            ? Number(topFormatObj.filesize || topFormatObj.filesize_approx || 0) +
              (topFormatObj.acodec && topFormatObj.acodec !== 'none' ? 0 : bestAudioSize)
            : undefined;

          const options: VideoFormatOption[] = [];

          // 1. Always put the smart "En Yüksek Kalite" option first, showing the ACTUAL max quality of this video!
          options.push({
            formatId: 'best',
            ext: 'mp4',
            resolution: `En Yüksek Kalite (Mevcut: ${maxQualityText})`,
            filesize: topEstSize || undefined,
            note: `Videodaki En Üst Görüntü + Ses Kalitesini Otomatik İndir (MP4 H.264)`,
            isAudioOnly: false,
            needsMerge: true,
            protocol: 'yt-dlp',
          });

          // 2. List each available resolution (from highest to lowest) that actually exists on this video
          for (const h of availableHeights) {
            const f = distinctByHeight.get(h);
            const w = f.width || '?';
            const vSize = Number(f.filesize || f.filesize_approx || 0);
            const hasAudio = f.acodec && f.acodec !== 'none';
            const totalSize = vSize > 0 ? vSize + (hasAudio ? 0 : bestAudioSize) : undefined;
            const fpsSuffix = f.fps && f.fps > 30 ? ` ${Math.round(f.fps)}fps` : '';
            const qualityLabel = this.getQualityBadgeText(h);

            options.push({
              // Use height-based selector `height:<h>` so yt-dlp reliably fetches the best video+audio at this exact height!
              formatId: `height:${h}`,
              ext: 'mp4',
              resolution: `${qualityLabel}${fpsSuffix} (${w}x${h})`,
              fps: f.fps,
              filesize: totalSize,
              vcodec: f.vcodec,
              acodec: f.acodec,
              tbr: f.tbr ? Math.round(f.tbr) : undefined,
              note: `MP4 Video + Ses (${
                String(f.vcodec || '').startsWith('avc1') ? 'H.264 Tam Uyumlu' : 'FFmpeg Birleştirme'
              })`,
              isAudioOnly: false,
              needsMerge: true,
              protocol: 'yt-dlp',
            });
          }

          // 3. Add Audio / MP3 Converter options!
          const audioConversionOptions = this.getStandardAudioConversionFormats(topEstSize);
          options.push(...audioConversionOptions);

          resolve({
            url: targetUrl,
            title: info.title || 'Video',
            thumbnail: info.thumbnail,
            durationSeconds: info.duration,
            uploader: info.uploader || info.channel,
            extractor: 'yt-dlp',
            formats: options,
            headers: info.http_headers || headers,
          });
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });
  }

  /**
   * Native HTML & Embedded Video Scraper for arbitrary websites
   */
  private async analyzeHtmlPageForVideos(
    pageUrl: string,
    headers: Record<string, string>
  ): Promise<VideoAnalysisResult> {
    const html = await this.fetchText(pageUrl, {
      Referer: pageUrl,
      ...headers,
    });

    const titleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const thumbMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );

    const rawTitle = titleMatch ? titleMatch[1].trim() : new URL(pageUrl).hostname;
    const discoveredUrls = new Set<string>();

    const srcRegex = /<(?:video|source)[^>]+src=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = srcRegex.exec(html)) !== null) {
      if (match[1] && !match[1].startsWith('blob:')) {
        try {
          discoveredUrls.add(new URL(match[1], pageUrl).toString());
        } catch {
          // ignore
        }
      }
    }

    const ogVideoRegex =
      /<meta[^>]+(?:property|name)=["'](?:og:video(?::secure_url|:url)?|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/gi;
    while ((match = ogVideoRegex.exec(html)) !== null) {
      try {
        discoveredUrls.add(new URL(match[1], pageUrl).toString());
      } catch {
        // ignore
      }
    }

    const directMediaRegex =
      /https?:\\?\/\\?\/[^\s"'<>\\]+?\.(?:m3u8|mp4|webm)(?:\?[^\s"'<>\\]*)?/gi;
    while ((match = directMediaRegex.exec(html)) !== null) {
      const cleaned = match[0].replace(/\\\//g, '/');
      try {
        discoveredUrls.add(new URL(cleaned).toString());
      } catch {
        // ignore
      }
    }

    const formats: VideoFormatOption[] = [];
    let index = 1;
    for (const mediaUrl of discoveredUrls) {
      const isM3u8 = mediaUrl.toLowerCase().includes('.m3u8');
      if (isM3u8) {
        try {
          const hlsAnalysis = await this.analyzeHlsUrl(mediaUrl, {
            Referer: pageUrl,
            ...headers,
          });
          for (const f of hlsAnalysis.formats) {
            formats.push(f);
          }
          continue;
        } catch {
          // fallback to single entry
        }
      }

      let filesize: number | undefined;
      try {
        const probe = await this.downloadEngine.probeUrl(mediaUrl, {
          Referer: pageUrl,
          ...headers,
        });
        filesize = probe.totalBytes || undefined;
      } catch {
        // ignore probe failure
      }

      const ext = isM3u8
        ? 'mp4'
        : path.extname(new URL(mediaUrl).pathname).replace('.', '') || 'mp4';

      formats.push({
        formatId: `scraped_${index++}`,
        ext,
        resolution: isM3u8
          ? `HLS Video Akışı #${index}`
          : `Doğrudan Video Akışı #${index} (${ext.toUpperCase()})`,
        filesize,
        note: isM3u8 ? 'HLS (.m3u8) Akış Birleştirme' : 'Çoklu Bağlantı (16 Parça) İndirme',
        isAudioOnly: false,
        needsMerge: isM3u8,
        streamUrl: mediaUrl,
        protocol: isM3u8 ? 'm3u8' : 'https',
      });
    }

    if (formats.length > 0) {
      formats.push(...this.getStandardAudioConversionFormats());
    }

    return {
      url: pageUrl,
      title: rawTitle,
      thumbnail: thumbMatch ? thumbMatch[1] : undefined,
      extractor: 'html-scraper',
      headers: { Referer: pageUrl, ...headers },
      formats,
    };
  }

  private fetchText(
    targetUrl: string,
    customHeaders: Record<string, string> = {},
    redirects = 0
  ): Promise<string> {
    if (redirects > 6) return Promise.reject(new Error('Too many redirects'));
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.request(
        parsed,
        {
          method: 'GET',
          headers: {
            'User-Agent': DEFAULT_UA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ...customHeaders,
          },
          rejectUnauthorized: false,
          timeout: 12000,
        },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            this.fetchText(nextUrl, customHeaders, redirects + 1)
              .then(resolve)
              .catch(reject);
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  private downloadFileWithRedirects(
    targetUrl: string,
    destPath: string,
    onProgress?: (downloaded: number, total: number) => void,
    redirects = 0
  ): Promise<void> {
    if (redirects > 8) return Promise.reject(new Error('Too many redirects'));
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.request(
        parsed,
        {
          method: 'GET',
          headers: { 'User-Agent': DEFAULT_UA },
        },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            this.downloadFileWithRedirects(nextUrl, destPath, onProgress, redirects + 1)
              .then(resolve)
              .catch(reject);
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            reject(new Error(`HTTP ${status}`));
            return;
          }

          const total = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;
          const fileStream = fs.createWriteStream(destPath);

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            onProgress?.(downloaded, total);
          });

          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
          fileStream.on('error', reject);
        }
      );
      req.on('error', reject);
      req.end();
    });
  }
}
