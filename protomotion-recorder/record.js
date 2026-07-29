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
    fps:      { type: 'string',              default: '60' },
    quality:  { type: 'string',  short: 'q', default: '18' },
    maxdur:   { type: 'string',  short: 'm', default: '600' },
    pause:    { type: 'string',  short: 'p', default: '2' },
    width:    { type: 'string',  short: 'w', default: '1536' },
    height:   { type: 'string',  short: 'h', default: '864' },
    scale:    { type: 'string',  short: 's', default: '1' },
    aspect:   { type: 'string',  short: 'a' },
    res:      { type: 'string',  short: 'r' },
    'design-width': { type: 'string', short: 'd' },
    fit:      { type: 'string',              default: 'width' },
    upscale:  { type: 'boolean', default: false },
    manual:   { type: 'boolean', default: false },
    headless: { type: 'boolean', default: false },
    debug:    { type: 'boolean', default: false },
  },
  strict: false,
});

if (!args.url) {
  console.log(`
  Figma Prototype Recorder

  Usage:
    node record.js -u <figma-prototype-url> [options]

  Options:
    -u, --url       Figma prototype URL (required)
    -o, --output    Output file path; .mp4 or .webm (default: prototype.mp4)
    --fps           Frames per second (default: 60)
    -q, --quality   CRF quality, lower = better/bigger (default: 18)
    -m, --maxdur    Safety cap on recording length in seconds (default: 600)
    -p, --pause     Seconds to wait between auto-clicks (default: 2)
    -w, --width     Recording width (default: 1536)
    -h, --height    Recording height (default: 864; ignored when --aspect is set)
    -a, --aspect    Aspect ratio of the video, e.g. 16:9, 4:5, 1.91:1 or 1.78.
                    Height is derived from --width, whatever the frame size in Figma
    -r, --res       Exact size instead of a ratio, e.g. 2880x1838
    -d, --design-width
                    Frame width in Figma, e.g. 1920. Use this whenever the video
                    is bigger than the design: Figma never scales a frame UP, so
                    without it you get the design at its own size on a grey
                    background. With it the window stays at the design width and
                    the pixel density is raised instead (no grey, full sharpness)
    -s, --scale     Extra render density for smoother edges (default: 1).
                    Does not change the file resolution
    --fit           How the Figma frame fits the shape (default: width)
                      width  = fill the width, may crop top/bottom
                      screen = whole frame visible, background fills the rest
                      actual = no scaling
    --upscale       With -d: record at the design size and let the encoder scale
                    the video up. Keeps the frame rate high on big outputs, at
                    the cost of some sharpness
    --manual        You click manually in the browser, script only records
    --headless      Run without visible browser
    --debug         Print canvas size changes (to diagnose zoom blink)

  Recording stops when you press Enter (or when --maxdur is reached).
  Video resolution = width x height (exactly what you ask for).

  Examples:
    node record.js -u "https://figma.com/proto/..."
    node record.js -u "https://figma.com/proto/..." --manual
    node record.js -u "https://figma.com/proto/..." -r 2880x1838 -d 1920
    node record.js -u "https://figma.com/proto/..." -a 16:9 -w 2880 -d 1920
    node record.js -u "https://figma.com/proto/..." -a 4:5 -w 1080 -d 1080
  `);
  process.exit(0);
}

const maxDuration = parseInt(args.maxdur) * 1000;
const clickPause = parseInt(args.pause) * 1000;
const scale = parseFloat(args.scale);
const outputPath = path.resolve(args.output);
const isManual = args.manual;

const die = (message) => {
  console.error(message);
  process.exit(1);
};

if (!Number.isFinite(scale) || scale <= 0) {
  die(`Invalid --scale "${args.scale}". Use a positive number, e.g. 1, 1.5 or 2.`);
}

const fps = parseInt(args.fps);
if (!Number.isFinite(fps) || fps < 1 || fps > 120) {
  die(`Invalid --fps "${args.fps}". Use a number between 1 and 120, e.g. 60.`);
}

const crf = parseInt(args.quality);
if (!Number.isFinite(crf) || crf < 0 || crf > 63) {
  die(`Invalid --quality "${args.quality}". Use a CRF between 0 (huge) and 63 (tiny); 18 is a good default.`);
}

const outputExt = path.extname(outputPath).toLowerCase();
if (!['.mp4', '.webm'].includes(outputExt)) {
  die(`Unsupported output "${path.basename(outputPath)}". Use a .mp4 or .webm file name.`);
}
const isMp4 = outputExt === '.mp4';

// ffmpeg does the encoding. Prefer a full build (H.264 + mp4); the one bundled
// with Playwright is VP8/webm only, so it is the last resort.
function resolveFfmpeg() {
  const works = (candidate) => {
    if (!candidate) return null;
    const probe = spawnSync(candidate, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) return null;
    const out = probe.stdout || '';
    return {
      path: candidate,
      canH264: /libx264/.test(out),
      canVp9: /libvpx-vp9/.test(out),
      canFilter: !/^$/.test(out), // full builds ship filters; verified below
    };
  };

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
    const found = works(candidate);
    if (found) {
      const filters = spawnSync(found.path, ['-hide_banner', '-filters'], { encoding: 'utf8' });
      found.canFilter = /(^|\s)scale(\s|$)/m.test(filters.stdout || '');
      return found;
    }
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

// Video encoders are happiest with even dimensions.
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// The output shape is decided here, independently of the frame size in
// Figma: --res for an exact size, --aspect for a ratio applied to --width.
let videoWidth;
let videoHeight;
let sizeSource;

if (args.res !== undefined) {
  const match = String(args.res).trim().match(/^(\d+)\s*[x:*×]\s*(\d+)$/i);
  if (!match) die(`Invalid --res "${args.res}". Use WIDTHxHEIGHT, e.g. 2880x1838.`);
  videoWidth = even(parseInt(match[1]));
  videoHeight = even(parseInt(match[2]));
  sizeSource = `--res ${args.res}`;
} else if (args.aspect !== undefined) {
  const raw = String(args.aspect).trim();
  const pair = raw.match(/^(\d+(?:\.\d+)?)\s*[:x/×]\s*(\d+(?:\.\d+)?)$/i);
  const ratio = pair
    ? parseFloat(pair[1]) / parseFloat(pair[2])
    : parseFloat(raw);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    die(`Invalid --aspect "${args.aspect}". Use W:H like 16:9 or 4:5, or a number like 1.78.`);
  }
  videoWidth = even(parseInt(args.width));
  videoHeight = even(videoWidth / ratio);
  sizeSource = `--aspect ${raw}`;
} else {
  videoWidth = even(parseInt(args.width));
  videoHeight = even(parseInt(args.height));
  sizeSource = '--width/--height';
}

if (!Number.isFinite(videoWidth) || !Number.isFinite(videoHeight) || videoWidth < 2 || videoHeight < 2) {
  die(`Invalid recording size (${videoWidth}x${videoHeight}). Check --width/--height/--aspect/--res.`);
}

// Figma only ever scales a frame DOWN to fit the window, never up, so on a
// window wider than the design the prototype sits at its own size surrounded by
// the prototype background. --design-width fixes that in one of two ways:
//   default    render at designWidth-times-higher density and blow the canvas up
//              by the same factor - sharp, but a lot of pixels to paint
//   --upscale  record a window the size of the design and let ffmpeg scale the
//              finished frames up - softer, but the frame rate stays high
const designWidth = args['design-width'] !== undefined ? parseInt(args['design-width']) : null;
if (designWidth !== null && (!Number.isFinite(designWidth) || designWidth < 2)) {
  die(`Invalid --design-width "${args['design-width']}". Use the frame width from Figma, e.g. 1920.`);
}

const ratioOfOutput = videoHeight / videoWidth;
const fitScale = designWidth !== null ? videoWidth / designWidth : 1;
if (fitScale < 1) {
  die(`--design-width ${designWidth} is wider than the video (${videoWidth}px). Figma scales down on its own here, so drop --design-width.`);
}

if (args.upscale && designWidth === null) {
  die('--upscale needs --design-width so it knows what size to record at, e.g. -d 1920.');
}
if (args.upscale && !ffmpeg.canFilter) {
  die(`The ffmpeg at ${ffmpeg.path} has no scale filter, so --upscale cannot work. Run "npm install" in this folder to get a full build.`);
}

// The window is the output size, except with --upscale where it is the design
// size. It is never bigger than the output: the encoder scales frames, so a
// window bigger than the video would just throw pixels away.
const width = args.upscale ? even(designWidth) : videoWidth;
const height = args.upscale ? even(designWidth * ratioOfOutput) : videoHeight;
const fillScale = args.upscale ? 1 : fitScale;

const deviceScaleFactor = fillScale * scale;
if (deviceScaleFactor > 4) {
  console.log(`Note: rendering at ${deviceScaleFactor.toFixed(2)}x density — heavy on CPU/RAM. Lower the output size if playback stutters.`);
}

// How the Figma frame is fitted into that shape.
const FIT_MODES = {
  width:  'scale-down-width',  // fill the width, may crop top/bottom
  screen: 'contain',           // whole frame visible, background fills the rest
  actual: 'min-zoom',          // no scaling
};
const fitKey = String(args.fit).trim().toLowerCase();
if (!(fitKey in FIT_MODES)) {
  die(`Invalid --fit "${args.fit}". Use one of: ${Object.keys(FIT_MODES).join(', ')}.`);
}

// Force the fit mode + hide UI
const protoUrl = new URL(args.url);
protoUrl.searchParams.set('scaling', FIT_MODES[fitKey]);
protoUrl.searchParams.set('hide-ui', '1');
protoUrl.searchParams.set('hotspot-hints', '0');
const finalUrl = protoUrl.toString();

const ratioLabel = (w, h) => {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  return `${w / g}:${h / g} (${(w / h).toFixed(3)})`;
};

console.log(`Recording: ${finalUrl}`);
console.log(`Output:    ${outputPath}`);
console.log(`Mode:      ${isManual ? 'Manual (you click)' : 'Auto (clicks center every ' + args.pause + 's)'}`);
console.log(`Max:       ${args.maxdur}s (safety cap)`);
console.log(`Stop:      press Enter`);
const trim = (n) => String(Number(n.toFixed(3)));
console.log(`Video:     ${videoWidth}x${videoHeight}  aspect ${ratioLabel(videoWidth, videoHeight)}   (from ${sizeSource})`);
console.log(`Window:    ${width}x${height} @${trim(deviceScaleFactor)}x density`);
console.log(`Design:    ${designWidth === null
  ? 'not set (Figma will not scale the frame up; add -d if you see grey borders)'
  : args.upscale
    ? `${designWidth}px wide -> recorded 1:1, then upscaled x${trim(videoWidth / width)} on encode (smoother, slightly softer)`
    : `${designWidth}px wide -> rendered at x${trim(fillScale)} density to fill the frame (sharpest)`}`);
console.log(`Format:    ${isMp4 ? 'mp4 / H.264' : ffmpeg.canVp9 ? 'webm / VP9' : 'webm / VP8'} @${fps}fps, crf ${crf}`);
console.log(`Fit:       ${fitKey} (scaling=${FIT_MODES[fitKey]})`);
console.log();

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  headless: args.headless,
  args: ['--no-sandbox', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});

const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor,
});

const page = await context.newPage();

console.log('Loading prototype...');
await page.goto(finalUrl, { waitUntil: 'load', timeout: 60_000 });
await page.waitForTimeout(5000);

// Hide cursor + lock canvas size to prevent zoom blink during transitions.
// With --design-width, blow the canvas up so the design fills the frame; the
// page already renders at fillScale density, so this stays pixel-for-pixel sharp.
await page.evaluate((fillScale) => {
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
      ${fillScale !== 1 ? `
      transform: scale(${fillScale}) !important;
      transform-origin: 50% 50% !important;
      ` : ''}
    }
  `;
  document.head.appendChild(style);
}, fillScale);

await page.waitForTimeout(500);

const clickX = width / 2;
const clickY = height / 2;

// ---- Recording engine -------------------------------------------------------
// Playwright's own recorder is locked to 25 fps / 1 Mbps webm, so we drive the
// capture ourselves: Chromium streams JPEG frames over CDP and we pipe them into
// ffmpeg at the requested frame rate.
const ffmpegArgs = [
  '-y',
  '-f', 'image2pipe',
  '-framerate', String(fps),
  '-i', '-',
];
if (ffmpeg.canFilter) ffmpegArgs.push('-vf', `scale=${videoWidth}:${videoHeight}:flags=lanczos`);
ffmpegArgs.push('-r', String(fps));
if (isMp4) {
  ffmpegArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
} else if (ffmpeg.canVp9) {
  ffmpegArgs.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0',
    '-deadline', 'realtime', '-cpu-used', '4', '-pix_fmt', 'yuv420p');
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

const cdp = await context.newCDPSession(page);
let latestFrame = null;
let capturedFrames = 0;

cdp.on('Page.screencastFrame', async (frame) => {
  latestFrame = Buffer.from(frame.data, 'base64');
  capturedFrames++;
  try {
    await cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
  } catch {
    // page closed mid-stream
  }
});

await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 92,
  maxWidth: videoWidth,
  maxHeight: videoHeight,
  everyNthFrame: 1,
});

// Constant frame rate: on every tick, top the pipe up to the frame index the
// wall clock says we should be at, repeating the last frame when the page has
// not painted anything new. Repeats reuse the same buffer, so they are free.
let writtenFrames = 0;
let recordingStart = 0;
const pump = () => {
  if (!recordingStart || !latestFrame || encoder.stdin.destroyed) return;
  const target = Math.floor(((Date.now() - recordingStart) / 1000) * fps);
  let budget = Math.ceil(fps / 4); // catch up gradually, never in a huge burst
  while (writtenFrames < target && budget-- > 0) {
    encoder.stdin.write(latestFrame);
    writtenFrames++;
  }
};
const pumpTimer = setInterval(pump, Math.max(4, Math.floor(500 / fps)));

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

let lastClickTime = 0;
let lastProbe = '';
const startTime = Date.now();
recordingStart = startTime;
let stopReason = '';

while (Date.now() - startTime < maxDuration) {
  if (manualStop) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    stopReason = `Stopped manually after ${elapsed}s`;
    break;
  }

  const now = Date.now();

  if (!isManual && now - lastClickTime >= clickPause) {
    await page.mouse.click(clickX, clickY);
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
        transform: getComputedStyle(c).transform,
        window: `${window.innerWidth}x${window.innerHeight}`,
        dpr: window.devicePixelRatio,
      };
    });
    if (probe) {
      const line = `buffer=${probe.buffer} css=${probe.css} win=${probe.window} dpr=${probe.dpr} transform=${probe.transform}`;
      if (line !== lastProbe) {
        console.log(`[${((Date.now() - startTime) / 1000).toFixed(1)}s] ${line}`);
        lastProbe = line;
      }
    }
  }
}

process.stdin.setRawMode(false);
process.stdin.pause();

if (!stopReason) {
  stopReason = `Reached max duration (${args.maxdur}s)`;
}
console.log(stopReason);

const recordedSeconds = (Date.now() - recordingStart) / 1000;
pump();
clearInterval(pumpTimer);
try {
  await cdp.send('Page.stopScreencast');
} catch {
  // page already gone
}

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
const capturedFps = (capturedFrames / recordedSeconds).toFixed(1);
console.log(`Done! Video saved to: ${outputPath}  (${sizeMb} MB)`);
console.log(`Frames:    ${fps} fps in the file; Chromium painted ${capturedFps} new frames/s during the recording`);
if (Number(capturedFps) < fps * 0.75) {
  console.log(`           Lower than ${fps} — the browser could not paint that fast at this size.`);
  console.log(`           Try a smaller -w, or -s 1, or close heavy apps.`);
}
