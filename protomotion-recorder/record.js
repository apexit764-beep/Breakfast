import { chromium } from '@playwright/test';
import { parseArgs } from 'node:util';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const { values: args } = parseArgs({
  options: {
    url:      { type: 'string',  short: 'u' },
    output:   { type: 'string',  short: 'o', default: 'prototype.mp4' },
    width:    { type: 'string',  short: 'w', default: '1920' },
    height:   { type: 'string',  short: 'h', default: '1080' },
    fps:      { type: 'string',              default: '60' },
    quality:  { type: 'string',  short: 'q', default: '18' },
    jpeg:     { type: 'string',              default: '92' },
    preset:   { type: 'string',              default: 'ultrafast' },
    maxdur:   { type: 'string',  short: 'm', default: '600' },
    pause:    { type: 'string',  short: 'p', default: '2' },
    manual:   { type: 'boolean', default: false },
    headless: { type: 'boolean', default: false },
    uncap:    { type: 'boolean', default: false },
    debug:    { type: 'boolean', default: false },
  },
  strict: false,
});

if (!args.url) {
  console.log(`
  Figma Prototype Recorder

  Records a Figma prototype at exactly the size of your Figma frame: 1:1, no
  scaling, no zoom. Output is mp4 (H.264) at 60 fps by default.

  Usage:
    node record.js -u <figma-prototype-url> -w <frame width> -h <frame height>

  Options:
    -u, --url       Figma prototype URL (required)
    -o, --output    Output file path; .mp4 or .webm (default: prototype.mp4)
    -w, --width     Frame width from Figma (default: 1920)
    -h, --height    Frame height from Figma (default: 1080)
    --fps           Frames per second (default: 60)
    -q, --quality   CRF quality, lower = better/bigger (default: 18)
    --jpeg          Quality of the frames grabbed from the browser, 1-100
                    (default: 92). Lower is faster if the browser can't keep up
    --preset        x264 speed/quality preset (default: ultrafast). Slower ones
                    look a bit better but steal CPU from the browser
    -m, --maxdur    Safety cap on recording length in seconds (default: 600)
    -p, --pause     Seconds to wait between auto-clicks (default: 2)
    --manual        You click manually in the browser, script only records
    --headless      Run without visible browser
    --uncap         Let Chromium paint without the vsync/frame-rate cap. Can
                    raise the frame rate, can also cause stutter - test both
    --debug         Print canvas size changes + per-second frame timings

  Recording stops when you press Enter (or when --maxdur is reached).
  While recording, a stats line every 5s shows the real frame rate.

  Examples:
    node record.js -u "https://figma.com/proto/..." -w 1920 -h 1226
    node record.js -u "https://figma.com/proto/..." -w 1920 -h 1226 --manual
    node record.js -u "https://figma.com/proto/..." -w 1920 -h 1226 --fps 30
  `);
  process.exit(0);
}

const die = (message) => {
  console.error(message);
  process.exit(1);
};

// Video encoders are happiest with even dimensions.
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

const width = even(parseInt(args.width));
const height = even(parseInt(args.height));
if (!Number.isFinite(width) || !Number.isFinite(height)) {
  die(`Invalid size ${args.width}x${args.height}. Pass the frame size from Figma, e.g. -w 1920 -h 1226.`);
}

const fps = parseInt(args.fps);
if (!Number.isFinite(fps) || fps < 1 || fps > 120) {
  die(`Invalid --fps "${args.fps}". Use a number between 1 and 120, e.g. 60.`);
}

const crf = parseInt(args.quality);
if (!Number.isFinite(crf) || crf < 0 || crf > 63) {
  die(`Invalid --quality "${args.quality}". Use a CRF between 0 (huge) and 63 (tiny); 18 is a good default.`);
}

const jpegQuality = parseInt(args.jpeg);
if (!Number.isFinite(jpegQuality) || jpegQuality < 1 || jpegQuality > 100) {
  die(`Invalid --jpeg "${args.jpeg}". Use 1-100; 92 is the default.`);
}

const X264_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'];
const x264Preset = String(args.preset).trim().toLowerCase();
if (!X264_PRESETS.includes(x264Preset)) {
  die(`Invalid --preset "${args.preset}". Use one of: ${X264_PRESETS.join(', ')}. Slower presets look better but steal CPU from the browser while recording.`);
}

const maxDuration = parseInt(args.maxdur) * 1000;
const clickPause = parseInt(args.pause) * 1000;
const outputPath = path.resolve(args.output);
const isManual = args.manual;

const outputExt = path.extname(outputPath).toLowerCase();
if (!['.mp4', '.webm'].includes(outputExt)) {
  die(`Unsupported output "${path.basename(outputPath)}". Use a .mp4 or .webm file name.`);
}
const isMp4 = outputExt === '.mp4';

// ffmpeg does the encoding. Prefer a full build (H.264 + mp4); the one bundled
// with Playwright is VP8/webm only, so it is the last resort.
function resolveFfmpeg() {
  const candidates = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  try {
    const required = createRequire(import.meta.url)('ffmpeg-static');
    if (required) candidates.push(required.default || required);
  } catch {
    // optional dependency not installed
  }
  candidates.push('ffmpeg');

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) continue;
    const encoders = probe.stdout || '';
    const filters = spawnSync(candidate, ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout || '';
    return {
      path: candidate,
      canH264: /libx264/.test(encoders),
      canVp9: /libvpx-vp9/.test(encoders),
      canFps: /(^|\s)fps(\s|$)/m.test(filters),
    };
  }
  return null;
}

const ffmpeg = resolveFfmpeg();
if (!ffmpeg) {
  die('No ffmpeg found. Run "npm install" in this folder (it installs one), or install ffmpeg and put it on your PATH.');
}
if (isMp4 && !ffmpeg.canH264) {
  die(`The ffmpeg found at ${ffmpeg.path} cannot write mp4 (no libx264).\nRun "npm install" in this folder to get a full build, or record to .webm instead.`);
}

// Force 1:1 presentation + hide UI. min-zoom keeps the frame at 100%: the window
// is already exactly the frame size, so nothing is scaled either way.
const protoUrl = new URL(args.url);
protoUrl.searchParams.set('scaling', 'min-zoom');
protoUrl.searchParams.set('hide-ui', '1');
protoUrl.searchParams.set('hotspot-hints', '0');
const finalUrl = protoUrl.toString();

console.log(`Recording: ${finalUrl}`);
console.log(`Output:    ${outputPath}`);
console.log(`Size:      ${width}x${height} 1:1 (no scaling)`);
console.log(`Format:    ${isMp4 ? 'mp4 / H.264' : ffmpeg.canVp9 ? 'webm / VP9' : 'webm / VP8'} @${fps}fps, crf ${crf}, jpeg ${jpegQuality}`);
console.log(`Mode:      ${isManual ? 'Manual (you click)' : 'Auto (clicks centre every ' + args.pause + 's)'}`);
console.log(`Max:       ${args.maxdur}s (safety cap)`);
console.log(`Stop:      press Enter`);
console.log();

const launchArgs = ['--no-sandbox'];
if (args.uncap) launchArgs.push('--disable-gpu-vsync', '--disable-frame-rate-limit');

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  headless: args.headless,
  args: launchArgs,
});

const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
});

const page = await context.newPage();

console.log('Loading prototype...');
await page.goto(finalUrl, { waitUntil: 'load', timeout: 60_000 });
await page.waitForTimeout(5000);

// Hide cursor + lock the canvas to the window so transitions can't resize it
await page.evaluate(() => {
  const style = document.createElement('style');
  style.textContent = `
    * { cursor: none !important; }
    html, body { overflow: hidden !important; }
    canvas {
      width: 100vw !important;
      height: 100vh !important;
      object-fit: contain !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
    }
  `;
  document.head.appendChild(style);
});

await page.waitForTimeout(500);

// ---- Recording engine -------------------------------------------------------
// Playwright's built-in recorder is locked to 25 fps / 1 Mbps webm, so we drive
// the capture ourselves: Chromium streams JPEG frames over CDP, each frame is
// written to ffmpeg once with its arrival time, and ffmpeg's fps filter turns
// that into a constant-rate video. Writing every frame only once (instead of
// padding to 60/s in Node) keeps the pipe small, which is what stops the
// recording from degrading as it gets longer.
const videoFilters = [`fps=${fps}`];
const ffmpegArgs = [
  '-y',
  '-f', 'image2pipe',
  '-use_wallclock_as_timestamps', '1',
  '-i', '-',
];
if (ffmpeg.canFps) ffmpegArgs.push('-vf', videoFilters.join(','));
ffmpegArgs.push('-r', String(fps));
if (isMp4) {
  ffmpegArgs.push('-c:v', 'libx264', '-preset', x264Preset, '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
} else if (ffmpeg.canVp9) {
  ffmpegArgs.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0',
    '-deadline', 'realtime', '-cpu-used', '5', '-pix_fmt', 'yuv420p');
} else {
  ffmpegArgs.push('-c:v', 'libvpx', '-crf', String(crf), '-b:v', '12M',
    '-deadline', 'realtime', '-speed', '8');
}
ffmpegArgs.push(outputPath);

const encoder = spawn(ffmpeg.path, ffmpegArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
let encoderError = '';
encoder.stderr.on('data', (chunk) => { encoderError += chunk.toString(); });
encoder.stdin.on('error', () => {});
const encoderExit = new Promise((resolve) => encoder.on('close', resolve));

// If ffmpeg ever falls behind, drop frames instead of letting Node buffer them:
// a dropped frame costs one repeated frame in the video, a growing buffer costs
// the whole recording.
const QUEUE_LIMIT = 48 * 1024 * 1024;
let captured = 0;
let dropped = 0;
let peakQueue = 0;

let lastFrame = null;

const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', (frame) => {
  const ack = cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  const queued = encoder.stdin.writableLength;
  if (queued > peakQueue) peakQueue = queued;
  if (encoder.stdin.destroyed || queued > QUEUE_LIMIT) {
    dropped++;
    return ack;
  }
  lastFrame = Buffer.from(frame.data, 'base64');
  encoder.stdin.write(lastFrame);
  captured++;
  return ack;
});

await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: jpegQuality,
  maxWidth: width,
  maxHeight: height,
  everyNthFrame: 1,
});

if (isManual) {
  console.log('Recording... Click in the browser to interact with the prototype.');
} else {
  console.log(`Recording... (auto-clicking every ${args.pause}s)`);
}
console.log('Press Enter to stop and save at any time.\n');

// Listen for Enter key to manually stop
let manualStop = false;
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (key) => {
  if (key[0] === 13 || key[0] === 10 || key[0] === 3) {
    manualStop = true;
  }
});

const startTime = Date.now();
let lastClickTime = 0;
let lastProbe = '';
let stopReason = '';

// Live stats: the frame rate in the last window, how much is queued for ffmpeg,
// and our own memory. If the recording degrades over time, this shows which one
// of the three is going wrong.
let statsAt = startTime;
let statsFrames = 0;
let statsDropped = 0;
const statsHistory = [];
const statsTimer = setInterval(() => {
  const now = Date.now();
  const seconds = (now - statsAt) / 1000;
  const rate = (captured - statsFrames) / seconds;
  const drops = dropped - statsDropped;
  const queueMb = encoder.stdin.writableLength / 1024 / 1024;
  const rssMb = process.memoryUsage().rss / 1024 / 1024;
  statsHistory.push({ at: Math.round((now - startTime) / 1000), rate, drops, queueMb, rssMb });
  console.log(`[${String(Math.round((now - startTime) / 1000)).padStart(3)}s] ${rate.toFixed(1)} fps painted` +
    `${drops ? `  ${drops} dropped` : ''}  queue ${queueMb.toFixed(1)} MB  rss ${rssMb.toFixed(0)} MB`);
  statsAt = now;
  statsFrames = captured;
  statsDropped = dropped;
}, 5000);

while (Date.now() - startTime < maxDuration) {
  if (manualStop) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    stopReason = `Stopped manually after ${elapsed}s`;
    break;
  }

  const now = Date.now();

  if (!isManual && now - lastClickTime >= clickPause) {
    await page.mouse.click(width / 2, height / 2);
    lastClickTime = now;
  }

  await page.waitForTimeout(400);

  if (args.debug) {
    const probe = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      return {
        buffer: `${c.width}x${c.height}`,
        css: `${c.clientWidth}x${c.clientHeight}`,
        window: `${window.innerWidth}x${window.innerHeight}`,
        dpr: window.devicePixelRatio,
      };
    });
    if (probe) {
      const line = `buffer=${probe.buffer} css=${probe.css} win=${probe.window} dpr=${probe.dpr}`;
      if (line !== lastProbe) {
        console.log(`[${((Date.now() - startTime) / 1000).toFixed(1)}s] ${line}`);
        lastProbe = line;
      }
    }
  }
}

clearInterval(statsTimer);
process.stdin.setRawMode(false);
process.stdin.pause();

if (!stopReason) {
  stopReason = `Reached max duration (${args.maxdur}s)`;
}
console.log(stopReason);

const recordedSeconds = (Date.now() - startTime) / 1000;
try {
  await cdp.send('Page.stopScreencast');
} catch {
  // page already gone
}

// One last frame stamped at the stop moment, so the video ends where the
// recording ended instead of at the last frame the prototype happened to paint.
if (lastFrame && !encoder.stdin.destroyed) encoder.stdin.write(lastFrame);

console.log('Encoding video...');
encoder.stdin.end();
const encoderCode = await encoderExit;

await browser.close();

if (encoderCode !== 0 || !fs.existsSync(outputPath)) {
  console.error(`ffmpeg failed (exit ${encoderCode}):`);
  console.error(encoderError.split('\n').slice(-12).join('\n'));
  process.exit(1);
}

const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
const averageFps = captured / recordedSeconds;
console.log(`Done! Video saved to: ${outputPath}  (${sizeMb} MB)`);
console.log(`Frames:    ${fps} fps in the file; browser painted ${averageFps.toFixed(1)} fps on average` +
  `${dropped ? `; ${dropped} frames dropped because the encoder fell behind` : ''}`);

// Point at the likely culprit when the recording was not smooth.
if (statsHistory.length >= 2) {
  const first = statsHistory[0];
  const last = statsHistory[statsHistory.length - 1];
  if (last.rate < first.rate * 0.7) {
    console.log(`Warning:   the frame rate fell from ${first.rate.toFixed(1)} to ${last.rate.toFixed(1)} fps during the recording.`);
    if (peakQueue > 8 * 1024 * 1024 || dropped) {
      console.log(`           The encoder was the bottleneck (queue peaked at ${(peakQueue / 1024 / 1024).toFixed(1)} MB).`);
      console.log(`           Try --fps 30, or --jpeg 75, or a smaller -w/-h.`);
    } else {
      console.log(`           The encoder kept up, so the browser itself slowed down.`);
      console.log(`           Try --jpeg 75, close other apps, and record shorter takes.`);
      if (args.uncap) console.log(`           Also try again without --uncap.`);
    }
  }
}
if (averageFps < fps * 0.75) {
  console.log(`           ${averageFps.toFixed(1)} fps is below the ${fps} you asked for: at this size the browser cannot paint that fast.`);
}
