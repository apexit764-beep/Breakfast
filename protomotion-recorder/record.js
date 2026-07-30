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
    preset:   { type: 'string',              default: 'veryfast' },
    maxdur:   { type: 'string',  short: 'm', default: '600' },
    pause:    { type: 'string',  short: 'p', default: '2' },
    manual:   { type: 'boolean', default: false },
    headless: { type: 'boolean', default: false },
    uncap:    { type: 'boolean', default: false },
    'keep-frames': { type: 'boolean', default: false },
    debug:    { type: 'boolean', default: false },
  },
  strict: false,
});

if (!args.url) {
  console.log(`
  Figma Prototype Recorder

  Records a Figma prototype at exactly the size of your Figma frame: 1:1, no
  scaling, no zoom. Output is mp4 (H.264) at 60 fps by default.

  Recording and encoding are two separate phases: while recording, frames are
  only saved to disk (cheap), and the video is encoded after you stop. A slow
  encoder can never slow down, stutter or slow-motion the recording.

  Usage:
    node record.js -u <figma-prototype-url> -w <frame width> -h <frame height>

  Options:
    -u, --url       Figma prototype URL (required)
    -o, --output    Output file path; .mp4 or .webm (default: prototype.mp4)
    -w, --width     Frame width from Figma (default: 1920)
    -h, --height    Frame height from Figma (default: 1080)
    --fps           Frames per second of the output (default: 60)
    -q, --quality   CRF quality, lower = better/bigger (default: 18)
    --jpeg          Quality of the frames grabbed from the browser, 1-100
                    (default: 92). Lower = smaller frames on disk
    --preset        x264 encode preset, ultrafast..slow (default: veryfast).
                    Encoding happens after recording, so slower is safe
    -m, --maxdur    Safety cap on recording length in seconds (default: 600)
    -p, --pause     Seconds to wait between auto-clicks (default: 2)
    --manual        You click manually in the browser, script only records
    --headless      Run without visible browser
    --uncap         Let Chromium paint without the vsync/frame-rate cap. Can
                    raise the frame rate, can also cause stutter - test both
    --keep-frames   Keep the captured .jpg frames folder next to the output
    --debug         Print canvas size changes while recording

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

const X264_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'];
const x264Preset = String(args.preset).trim().toLowerCase();
if (!X264_PRESETS.includes(x264Preset)) {
  die(`Invalid --preset "${args.preset}". Use one of: ${X264_PRESETS.join(', ')}.`);
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
// with Playwright is VP8/webm only and has no concat demuxer, so it won't do.
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
    const demuxers = spawnSync(candidate, ['-hide_banner', '-demuxers'], { encoding: 'utf8' }).stdout || '';
    return {
      path: candidate,
      canH264: /libx264/.test(encoders),
      canVp9: /libvpx-vp9/.test(encoders),
      canConcat: /(^|\s)concat(\s|$)/m.test(demuxers),
    };
  }
  return null;
}

const ffmpeg = resolveFfmpeg();
if (!ffmpeg) {
  die('No ffmpeg found. Run "npm install" in this folder (it installs one), or install ffmpeg and put it on your PATH.');
}
if (!ffmpeg.canConcat) {
  die(`The ffmpeg found at ${ffmpeg.path} has no concat demuxer.\nRun "npm install" in this folder to get a full build.`);
}
if (isMp4 && !ffmpeg.canH264) {
  die(`The ffmpeg found at ${ffmpeg.path} cannot write mp4 (no libx264).\nRun "npm install" in this folder to get a full build, or record to .webm instead.`);
}

// Frames are captured to disk first, encoded after the recording stops.
const framesDir = path.join(path.dirname(outputPath),
  `.${path.basename(outputPath).replace(/\.[^.]+$/, '')}-frames-${process.pid}`);
fs.mkdirSync(framesDir, { recursive: true });

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

// ---- Capture phase ----------------------------------------------------------
// Chromium streams JPEG frames over CDP; each one is written straight to disk
// together with its CAPTURE time. Nothing else competes for the CPU while
// recording. Timing the frames at capture (instead of when an encoder gets
// round to reading them) is what keeps the video at real speed: stamping them
// at read time stretches the timeline whenever encoding lags, which shows up
// as slow motion.
const frameTimes = [];
let bytesWritten = 0;

const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', (frame) => {
  const ack = cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  const buffer = Buffer.from(frame.data, 'base64');
  const index = frameTimes.length + 1;
  try {
    fs.writeFileSync(path.join(framesDir, `f_${String(index).padStart(6, '0')}.jpg`), buffer);
  } catch (error) {
    die(`Cannot write frames to ${framesDir}: ${error.message}`);
  }
  frameTimes.push(frame.metadata?.timestamp ?? Date.now() / 1000);
  bytesWritten += buffer.length;
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

// Live stats: real painted frame rate + disk usage of the captured frames.
let statsAt = startTime;
let statsFrames = 0;
const statsTimer = setInterval(() => {
  const now = Date.now();
  const rate = (frameTimes.length - statsFrames) / ((now - statsAt) / 1000);
  console.log(`[${String(Math.round((now - startTime) / 1000)).padStart(3)}s] ` +
    `${rate.toFixed(1)} fps painted  frames ${frameTimes.length}  disk ${(bytesWritten / 1024 / 1024).toFixed(0)} MB`);
  statsAt = now;
  statsFrames = frameTimes.length;
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

const stoppedAt = Date.now();
try {
  await cdp.send('Page.stopScreencast');
} catch {
  // page already gone
}
await browser.close();

// ---- Encode phase -----------------------------------------------------------
if (frameTimes.length === 0) {
  fs.rmSync(framesDir, { recursive: true, force: true });
  die('No frames were captured - nothing to encode.');
}

const recordedSeconds = (stoppedAt - startTime) / 1000;
const averageFps = frameTimes.length / recordedSeconds;

// Each frame is shown from its capture time until the next frame's capture
// time; the concat demuxer takes exactly that as per-frame durations, and the
// fps filter resamples the result into constant frame rate. The video timeline
// is therefore the capture timeline, whatever speed the encoder runs at.
const MIN_DURATION = 0.001;
const lastIndex = frameTimes.length;
const lastName = `f_${String(lastIndex).padStart(6, '0')}.jpg`;
const tailSeconds = Math.max(MIN_DURATION, (stoppedAt / 1000) - (startTime / 1000) - (frameTimes[lastIndex - 1] - frameTimes[0]));
const listLines = ['ffconcat version 1.0'];
for (let i = 0; i < lastIndex; i++) {
  const name = `f_${String(i + 1).padStart(6, '0')}.jpg`;
  const duration = i + 1 < lastIndex
    ? Math.max(MIN_DURATION, frameTimes[i + 1] - frameTimes[i])
    : tailSeconds;
  listLines.push(`file '${name}'`, `duration ${duration.toFixed(6)}`);
}
// concat ignores the duration of the final entry unless it is listed again
listLines.push(`file '${lastName}'`);
const listPath = path.join(framesDir, 'frames.ffconcat');
fs.writeFileSync(listPath, listLines.join('\n') + '\n');

const encodeArgs = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-vf', `fps=${fps}`, '-r', String(fps)];
if (isMp4) {
  encodeArgs.push('-c:v', 'libx264', '-preset', x264Preset, '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
} else if (ffmpeg.canVp9) {
  encodeArgs.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-pix_fmt', 'yuv420p');
} else {
  encodeArgs.push('-c:v', 'libvpx', '-crf', String(crf), '-b:v', '12M');
}
encodeArgs.push(outputPath);

console.log(`Encoding ${frameTimes.length} frames (${(bytesWritten / 1024 / 1024).toFixed(0)} MB) -> ${path.basename(outputPath)} ...`);
const encodeStarted = Date.now();
const encoder = spawn(ffmpeg.path, encodeArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
let encoderError = '';
let lastReport = '';
encoder.stderr.on('data', (chunk) => {
  encoderError += chunk.toString();
  const match = encoderError.match(/time=(\d+):(\d+):(\d+\.\d+)(?![\s\S]*time=)/);
  if (match) {
    const done = (+match[1] * 3600 + +match[2] * 60 + +match[3]);
    const report = `  encoded ${done.toFixed(0)}s / ${recordedSeconds.toFixed(0)}s`;
    if (report !== lastReport) {
      process.stdout.write(report + '\r');
      lastReport = report;
    }
  }
});
const encoderCode = await new Promise((resolve) => encoder.on('close', resolve));
process.stdout.write('\n');

if (encoderCode !== 0 || !fs.existsSync(outputPath)) {
  console.error(`ffmpeg failed (exit ${encoderCode}):`);
  console.error(encoderError.split('\n').filter(Boolean).slice(-12).join('\n'));
  console.error(`The captured frames were kept in: ${framesDir}`);
  process.exit(1);
}

if (args['keep-frames']) {
  console.log(`Frames kept in: ${framesDir}`);
} else {
  fs.rmSync(framesDir, { recursive: true, force: true });
}

const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
const encodeSeconds = ((Date.now() - encodeStarted) / 1000).toFixed(1);
console.log(`Done! Video saved to: ${outputPath}  (${sizeMb} MB, encoded in ${encodeSeconds}s)`);
console.log(`Length:    ${recordedSeconds.toFixed(1)}s of recording -> ${recordedSeconds.toFixed(1)}s of video, real speed`);
console.log(`Frames:    ${fps} fps in the file; browser painted ${averageFps.toFixed(1)} fps on average`);
if (averageFps < fps * 0.75) {
  console.log(`           ${averageFps.toFixed(1)} fps is below the ${fps} you asked for: at this size the browser cannot paint faster.`);
  console.log(`           Transitions will still play at real speed, just with fewer distinct frames.`);
}
