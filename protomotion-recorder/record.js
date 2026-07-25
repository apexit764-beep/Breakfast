import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const { values: args } = parseArgs({
  options: {
    url:      { type: 'string',  short: 'u' },
    output:   { type: 'string',  short: 'o', default: 'prototype.webm' },
    maxdur:   { type: 'string',  short: 'm', default: '120' },
    idle:     { type: 'string',  short: 'i', default: '5' },
    pause:    { type: 'string',  short: 'p', default: '2' },
    width:    { type: 'string',  short: 'w', default: '1536' },
    height:   { type: 'string',  short: 'h', default: '864' },
    scale:    { type: 'string',  short: 's', default: '1' },
    manual:   { type: 'boolean', default: false },
    headless: { type: 'boolean', default: false },
    debug:    { type: 'boolean', default: false },
    nodetect: { type: 'boolean', default: false },
    fps:      { type: 'string',  default: '60' },
    bitrate:  { type: 'string',  default: '8' },
    scaling:  { type: 'string',  default: 'contain' },
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
    -o, --output    Output file path (default: prototype.webm)
    -m, --maxdur    Max recording duration in seconds (default: 120)
    -i, --idle      Stop after this many seconds of no change (default: 5)
    -p, --pause     Seconds to wait between auto-clicks (default: 2)
    -w, --width     Viewport width (default: 1536)
    -h, --height    Viewport height (default: 864)
    -s, --scale     Device scale factor (default: 1)
    --manual        You click manually in the browser, script only records
    --headless      Run without visible browser
    --debug         Print canvas size/zoom changes (to diagnose zoom blink)
    --nodetect      Disable screenshot polling (no auto-stop; Enter or max only)
    --fps           Video framerate (default: 60, Playwright's own default is 25)
    --bitrate       Video bitrate in Mbps (default: 8, Playwright's default is 1)
    --scaling       Figma scaling mode (default: contain)
                      contain           fit whole frame, never crops
                      scale-down-width  fit width, crops tall frames
                      min-zoom          actual size (100%)

  Examples:
    node record.js -u "https://figma.com/proto/..."
    node record.js -u "https://figma.com/proto/..." --manual

  Mobile — set the viewport to the frame size so nothing is scaled or cropped:
    iPhone 16 (393x852):  node record.js -u "..." -w 393 -h 852 -s 3
    node record.js -u "https://figma.com/proto/..." -p 3 -w 1280 -h 720
  `);
  process.exit(0);
}

const fps = parseInt(args.fps);
const bitrate = parseInt(args.bitrate);

// These get written into Playwright's own source, so a bad value would corrupt
// the install rather than just fail this run.
if (!Number.isInteger(fps) || fps < 1 || fps > 120) {
  console.error(`Invalid --fps "${args.fps}" (expected an integer between 1 and 120)`);
  process.exit(1);
}
if (!Number.isInteger(bitrate) || bitrate < 1 || bitrate > 100) {
  console.error(`Invalid --bitrate "${args.bitrate}" (expected an integer between 1 and 100)`);
  process.exit(1);
}

// Playwright hardcodes 25fps / 1Mbps VP8 for video recording, with no API to
// change either. Rewrite those constants in the installed bundle before the
// module is loaded. Patterns are matched loosely so re-running is idempotent.
function patchPlaywrightEncoder(fps, bitrate) {
  const require = createRequire(import.meta.url);
  let bundle;
  try {
    bundle = path.join(path.dirname(require.resolve('playwright-core')), 'lib', 'coreBundle.js');
  } catch {
    return 'playwright-core not found';
  }

  let src;
  try {
    src = fs.readFileSync(bundle, 'utf8');
  } catch (err) {
    return `cannot read bundle (${err.code})`;
  }

  const edits = [
    [/fps = \d+;/, `fps = ${fps};`],
    [/-b:v \d+M/, `-b:v ${bitrate}M`],
    [/-threads \d+/, '-threads 4'],
  ];

  let patched = src;
  for (const [pattern, replacement] of edits) {
    if (!pattern.test(patched)) return `pattern not found: ${pattern}`;
    patched = patched.replace(pattern, replacement);
  }

  if (patched === src) return null; // already at these settings

  try {
    fs.writeFileSync(bundle, patched);
  } catch (err) {
    return `cannot write bundle (${err.code})`;
  }
  return null;
}

const patchError = patchPlaywrightEncoder(fps, bitrate);
const { chromium } = await import('@playwright/test');

const width = parseInt(args.width);
const height = parseInt(args.height);
const maxDuration = parseInt(args.maxdur) * 1000;
const idleTimeout = parseInt(args.idle) * 1000;
const clickPause = parseInt(args.pause) * 1000;
const scale = parseFloat(args.scale);
const outputPath = path.resolve(args.output);
const isManual = args.manual;

// Force fit-width + hide UI
const protoUrl = new URL(args.url);
protoUrl.searchParams.set('scaling', args.scaling);
protoUrl.searchParams.set('hide-ui', '1');
protoUrl.searchParams.set('hotspot-hints', '0');
const finalUrl = protoUrl.toString();

console.log(`Recording: ${finalUrl}`);
console.log(`Output:    ${outputPath}`);
console.log(`Mode:      ${isManual ? 'Manual (you click)' : 'Auto (clicks center every ' + args.pause + 's)'}`);
console.log(`Max:       ${args.maxdur}s`);
console.log(`Idle stop: ${args.nodetect ? 'disabled (press Enter to stop)' : args.idle + 's of no change'}`);
console.log(`Viewport:  ${width}x${height} @${scale}x  (scaling=${args.scaling})`);
console.log(`Recorded:  ${Math.round(width * scale)}x${Math.round(height * scale)}`);
if (patchError) {
  console.log(`Video:     25fps @1Mbps (Playwright default — patch skipped: ${patchError})`);
} else {
  console.log(`Video:     ${fps}fps @${bitrate}Mbps`);
}
console.log();

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  headless: args.headless,
  args: ['--no-sandbox'],
});

const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: scale,
  recordVideo: {
    dir: path.dirname(outputPath),
    // Record at the rendered resolution, not the CSS one, so --scale actually
    // buys sharpness instead of being downsampled away.
    size: { width: Math.round(width * scale), height: Math.round(height * scale) },
  },
});

const page = await context.newPage();

console.log('Loading prototype...');
await page.goto(finalUrl, { waitUntil: 'load', timeout: 60_000 });
await page.waitForTimeout(5000);

// Hide cursor + lock canvas size to prevent zoom blink during transitions
await page.evaluate(() => {
  const style = document.createElement('style');
  style.textContent = `
    * { cursor: none !important; }
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

if (isManual) {
  console.log('Recording... Click in the browser to interact with the prototype.');
} else {
  console.log('Recording... (auto-clicking + auto-stop on idle)');
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

const detectIdle = !args.nodetect;
let previousShot = detectIdle ? await page.screenshot({ type: 'jpeg', quality: 40 }) : null;
let idleStart = null;
let lastClickTime = 0;
let lastProbe = '';
const startTime = Date.now();
let stopReason = '';

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
        transform: getComputedStyle(c).transform,
        window: `${window.innerWidth}x${window.innerHeight}`,
      };
    });
    if (probe) {
      const line = `buffer=${probe.buffer} css=${probe.css} win=${probe.window} transform=${probe.transform}`;
      if (line !== lastProbe) {
        console.log(`[${((Date.now() - startTime) / 1000).toFixed(1)}s] ${line}`);
        lastProbe = line;
      }
    }
  }

  if (!detectIdle) continue;

  const currentShot = await page.screenshot({ type: 'jpeg', quality: 40 });
  const changed = !previousShot.equals(currentShot);

  if (changed) {
    idleStart = null;
    previousShot = currentShot;
  } else {
    if (!idleStart) idleStart = Date.now();
    if (Date.now() - idleStart >= idleTimeout) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      stopReason = `Prototype finished after ${elapsed}s`;
      break;
    }
  }
}

process.stdin.setRawMode(false);
process.stdin.pause();

if (!stopReason) {
  stopReason = `Reached max duration (${args.maxdur}s)`;
}
console.log(stopReason);

console.log('Saving video...');
await context.close();

const video = page.video();
if (video) {
  const savedPath = await video.path();
  fs.renameSync(savedPath, outputPath);
}

await browser.close();
console.log(`Done! Video saved to: ${outputPath}`);
