import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DownloadEngine,
  parseTimeToSeconds,
  formatSecondsToTime,
} = require('../dist-electron/downloadEngine.js');
const { VideoEngine } = require('../dist-electron/videoEngine.js');

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idm-pro-test-'));
  const downloadDir = path.join(tmpDir, 'downloads');
  fs.mkdirSync(downloadDir, { recursive: true });

  // Generate 4 MB deterministic random payload for multi-connection Range download test
  const payloadSize = 4 * 1024 * 1024;
  const payloadBuffer = crypto.randomBytes(payloadSize);
  const expectedHash = crypto.createHash('sha256').update(payloadBuffer).digest('hex');

  let rangeRequestCount = 0;

  const server = http.createServer((req, res) => {
    const u = req.url || '/';

    if (u === '/test-video.mp4') {
      const range = req.headers.range;
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="test-video.mp4"');

      if (range) {
        rangeRequestCount++;
        const match = range.match(/bytes=(\d+)-(\d*)/);
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : payloadSize - 1;
        const slice = payloadBuffer.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${payloadSize}`,
          'Content-Length': String(slice.length),
        });
        res.end(slice);
      } else {
        res.writeHead(200, { 'Content-Length': String(payloadSize) });
        res.end(payloadBuffer);
      }
      return;
    }

    if (u === '/master.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end(
        [
          '#EXTM3U',
          '#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080,FRAME-RATE=60',
          '/stream_1080p.m3u8',
          '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720,FRAME-RATE=30',
          '/stream_720p.m3u8',
        ].join('\n')
      );
      return;
    }

    if (u === '/video-page.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Örnek Sinema Videosu</title>
            <meta property="og:title" content="Örnek Sinema Videosu 4K" />
          </head>
          <body>
            <video src="/test-video.mp4"></video>
            <script>
              const playerConfig = { hlsUrl: "http://127.0.0.1:${
                server.address().port
              }/master.m3u8" };
            </script>
          </body>
        </html>
      `);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const resolvePortableFfmpeg = () => {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
    if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) return '/opt/homebrew/bin/ffmpeg';
    if (fs.existsSync('/usr/local/bin/ffmpeg')) return '/usr/local/bin/ffmpeg';
    if (fs.existsSync('/usr/bin/ffmpeg')) return '/usr/bin/ffmpeg';
    return 'ffmpeg';
  };

  const engine = new DownloadEngine(tmpDir, {
    downloadDir,
    maxConnectionsPerDownload: 8,
    maxConcurrentDownloads: 4,
    speedLimitKbps: 0,
    autoStartDownloads: false,
    clipboardMonitor: false,
    ytDlpPath: '',
    ffmpegPath: resolvePortableFfmpeg(),
  });

  const videoEngine = new VideoEngine(engine, tmpDir);

  console.log('1) Testing URL Probe & Range detection...');
  const probe = await engine.probeUrl(`${baseUrl}/test-video.mp4`);
  assert.equal(probe.totalBytes, payloadSize);
  assert.equal(probe.resumable, true);
  assert.equal(probe.category, 'video');
  console.log('   ✓ URL Probe verified:', probe.fileName, probe.totalBytes, 'bytes');

  console.log('2) Testing 8-Connection Parallel Chunk Download & Byte Integrity...');
  const item = await engine.addDownload({
    url: `${baseUrl}/test-video.mp4`,
    connectionsCount: 8,
    autoStart: false,
  });

  await engine.startDownload(item.id);
  const finished = engine.getItem(item.id);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.downloadedBytes, payloadSize);
  assert.ok(rangeRequestCount >= 8, `Expected >= 8 range requests, got ${rangeRequestCount}`);

  const downloadedBytes = fs.readFileSync(finished.savePath);
  const actualHash = crypto.createHash('sha256').update(downloadedBytes).digest('hex');
  assert.equal(actualHash, expectedHash, 'Downloaded file SHA256 must match source exactly!');
  console.log(
    `   ✓ 8-Connection parallel download completed & SHA256 verified (${rangeRequestCount} range requests)`
  );

  console.log('3) Testing HLS (.m3u8) Master Playlist & HTML Video Analyzer...');
  const pageAnalysis = await videoEngine.analyzeUrl(`${baseUrl}/video-page.html`);
  assert.equal(pageAnalysis.title, 'Örnek Sinema Videosu 4K');
  assert.ok(pageAnalysis.formats.length >= 3, 'Should detect both MP4 and HLS 1080p/720p variants');
  console.log(
    '   ✓ Webpage Video Analyzer discovered formats:',
    pageAnalysis.formats.map((f) => f.resolution).join(', ')
  );

  console.log('4) Testing Clip Range Time Parsers & Formatters...');
  assert.equal(parseTimeToSeconds('01:30'), 90);
  assert.equal(parseTimeToSeconds('01:05:20'), 3920);
  assert.equal(parseTimeToSeconds('45'), 45);
  assert.equal(parseTimeToSeconds(''), 0);
  assert.equal(parseTimeToSeconds('1h 30m'), 5400);
  assert.equal(parseTimeToSeconds('1sa 29dk 30sn'), 5370);
  assert.equal(parseTimeToSeconds('01:29:338'), 89.338);
  assert.equal(formatSecondsToTime(90), '01:30');
  assert.equal(formatSecondsToTime(90, true), '00:01:30');
  assert.equal(formatSecondsToTime(3920), '01:05:20');
  console.log('   ✓ Clip & Download time parsing & formatting verified');

  engine.destroy();
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('ALL TESTS PASSED!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
