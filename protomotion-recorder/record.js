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
    cursor:   { type: 'boolean', default: false },
    fit:      { type: 'boolean', default: false },
    'save-clicks': { type: 'string' },
    'play-clicks': { type: 'string' },
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
    -w, --width     Figma frame width (default: 1536)
    -h, --height    Figma frame height (default: 864)
    -s, --scale     Resolution multiplier (default: 1) — 393x852 -s 3 records
                    at 1179x2556. Keeps the aspect ratio, so nothing is cropped.
    --manual        You click manually in the browser, script only records
    --cursor        Show the mouse cursor (needed to aim in --manual mode)
    --fit           Shrink the viewport so the whole window fits your screen
    --save-clicks   Save your manual clicks to a JSON file
    --play-clicks   Replay clicks from a JSON file instead of clicking
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

  Click small, render big — two passes:
    1) node record.js -u "..." -w 393 -h 852 --fit --manual --cursor --save-clicks c.json
    2) node record.js -u "..." -w 393 -h 852 -s 3 --headless --play-clicks c.json
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

// Chromium's screencast captures at the CSS viewport size — deviceScaleFactor
// does not raise it. So --scale enlarges the viewport instead: Figma renders
// its canvas at the higher zoom, which is a genuine resolution increase. The
// aspect ratio is preserved, so scaling=contain still fills it exactly.
// VP8/yuv420p needs even dimensions — an odd one gets silently shaved by the
// encoder, so round to even here and keep the viewport and video identical.
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// Filled in below, after --fit has had a chance to measure the screen.
let effectiveScale = scale;
let vw = even(width * scale);
let vh = even(height * scale);

// Load the click track up front so a bad file fails before a browser is opened.
let playClicks = [];
if (args['play-clicks']) {
  try {
    playClicks = JSON.parse(fs.readFileSync(args['play-clicks'], 'utf8'));
  } catch (err) {
    console.error(`Cannot read click track "${args['play-clicks']}": ${err.message}`);
    process.exit(1);
  }
  const valid = Array.isArray(playClicks) && playClicks.every(
    (c) => c && [c.t, c.x, c.y].every(Number.isFinite));
  if (!valid) {
    console.error(`Click track "${args['play-clicks']}" must be an array of {t,x,y} numbers`);
    process.exit(1);
  }
  playClicks.sort((a, b) => a.t - b.t);
}

// Force fit-width + hide UI
const protoUrl = new URL(args.url);
protoUrl.searchParams.set('scaling', args.scaling);
protoUrl.searchParams.set('hide-ui', '1');
protoUrl.searchParams.set('hotspot-hints', '0');
const finalUrl = protoUrl.toString();

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  headless: args.headless,
  args: ['--no-sandbox'],
});

// --fit: shrink the viewport until the window fits the display, so you can
// actually see the whole prototype while clicking. Measure with a throwaway
// page, since the real context needs its viewport fixed up front.
if (args.fit && !args.headless) {
  const probe = await browser.newPage();
  const screen = await probe.evaluate(() => ({
    w: window.screen.availWidth,
    h: window.screen.availHeight,
  }));
  await probe.close();
  const CHROME_HEIGHT = 130; // tab strip + address bar + window frame
  const room = Math.min(screen.w / width, (screen.h - CHROME_HEIGHT) / height);
  effectiveScale = Math.max(0.1, Math.min(scale, Math.floor(room * 100) / 100));
  vw = even(width * effectiveScale);
  vh = even(height * effectiveScale);
}

console.log(`Recording: ${finalUrl}`);
console.log(`Output:    ${outputPath}`);
const mode = playClicks.length ? `Replay (${playClicks.length} clicks from ${args['play-clicks']})`
  : isManual ? 'Manual (you click)'
  : `Auto (clicks center every ${args.pause}s)`;
console.log(`Mode:      ${mode}`);
console.log(`Max:       ${args.maxdur}s`);
console.log(`Idle stop: ${args.nodetect ? 'disabled (press Enter to stop)' : args.idle + 's of no change'}`);
console.log(`Frame:     ${width}x${height} @${effectiveScale}x  (scaling=${args.scaling})`);
console.log(`Recorded:  ${vw}x${vh}${args.fit && effectiveScale !== scale ? '  (shrunk by --fit)' : ''}`);
if (patchError) {
  console.log(`Video:     25fps @1Mbps (Playwright default — patch skipped: ${patchError})`);
} else {
  console.log(`Video:     ${fps}fps @${bitrate}Mbps`);
}
console.log();

const context = await browser.newContext({
  viewport: { width: vw, height: vh },
  recordVideo: {
    dir: path.dirname(outputPath),
    // Must match the viewport exactly — a larger size makes ffmpeg pad the
    // frame with gray instead of producing a sharper picture.
    size: { width: vw, height: vh },
  },
});

// Clicks are stored as fractions of the viewport, so a pass recorded in a small
// window replays identically in a large headless one. This is what lets you
// click comfortably at -s 1 and still render at -s 3.
const savedClicks = [];
if (args['save-clicks']) {
  await context.exposeBinding('__protoClick', (source, x, y) => {
    savedClicks.push({ t: Date.now(), x, y });
  });
}

const page = await context.newPage();

// A viewport taller/wider than the display still records correctly, but the
// window can only show the part that fits — which makes manual clicking blind.
if (!args.headless) {
  const screen = await page.evaluate(() => ({
    w: window.screen.availWidth,
    h: window.screen.availHeight,
  }));
  if (vw > screen.w || vh > screen.h) {
    const fit = Math.min(screen.w / width, (screen.h - 120) / height);
    console.log('');
    console.log(`  !  Viewport ${vw}x${vh} is larger than your screen (${screen.w}x${screen.h}).`);
    console.log('     The video will still be correct, but the browser window can only');
    console.log('     show part of it — you will not be able to click accurately.');
    console.log(`     For manual clicking use:  -s ${Math.max(1, Math.floor(fit * 10) / 10)}`);
    console.log('');
  }
}

console.log('Loading prototype...');
await page.goto(finalUrl, { waitUntil: 'load', timeout: 60_000 });
await page.waitForTimeout(5000);

// Hide cursor + lock canvas size to prevent zoom blink during transitions
await page.evaluate((showCursor) => {
  const style = document.createElement('style');
  style.textContent = `
    ${showCursor ? '' : '* { cursor: none !important; }'}
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
}, args.cursor);

// Capture phase, so Figma's own canvas handlers cannot swallow the event first.
if (args['save-clicks']) {
  await page.evaluate(() => {
    window.addEventListener('pointerdown', (e) => {
      window.__protoClick(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    }, true);
  });
}

await page.waitForTimeout(500);

if (playClicks.length) {
  console.log(`Recording... (replaying ${playClicks.length} clicks from ${args['play-clicks']})`);
} else if (isManual) {
  console.log('Recording... Click in the browser to interact with the prototype.');
} else {
  console.log('Recording... (auto-clicking + auto-stop on idle)');
}
if (args['save-clicks']) {
  console.log(`Your clicks are being saved to ${args['save-clicks']}`);
}
console.log(process.stdin.isTTY
  ? 'Press Enter to stop and save at any time.\n'
  : 'Stdin is not a terminal — Enter-to-stop is disabled.\n');

// Listen for Enter key to manually stop. Only possible on a real terminal —
// piped or redirected stdin has no raw mode.
let manualStop = false;
const canReadKeys = process.stdin.isTTY;
if (canReadKeys) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (key) => {
    if (key[0] === 13 || key[0] === 10 || key[0] === 3) {
      manualStop = true;
    }
  });
}

const detectIdle = !args.nodetect;
let previousShot = detectIdle ? await page.screenshot({ type: 'jpeg', quality: 40 }) : null;
let idleStart = null;
let lastClickTime = 0;
let nextClick = 0;
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

  if (playClicks.length) {
    while (nextClick < playClicks.length && now - startTime >= playClicks[nextClick].t) {
      const c = playClicks[nextClick];
      await page.mouse.click(c.x * vw, c.y * vh);
      nextClick++;
    }
  } else if (!isManual && now - lastClickTime >= clickPause) {
    await page.mouse.click(vw / 2, vh / 2);
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
    // A replay can sit idle between two scripted clicks — that is not the end.
    if (nextClick < playClicks.length) idleStart = null;
    else if (Date.now() - idleStart >= idleTimeout) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      stopReason = `Prototype finished after ${elapsed}s`;
      break;
    }
  }
}

if (canReadKeys) {
  process.stdin.setRawMode(false);
  process.stdin.pause();
}

if (!stopReason) {
  stopReason = `Reached max duration (${args.maxdur}s)`;
}
console.log(stopReason);

if (args['save-clicks']) {
  const track = savedClicks.map((c) => ({
    t: c.t - startTime,
    x: Number(c.x.toFixed(5)),
    y: Number(c.y.toFixed(5)),
  })).filter((c) => c.t >= 0);
  fs.writeFileSync(args['save-clicks'], JSON.stringify(track, null, 2));
  console.log(`Saved ${track.length} clicks to ${path.resolve(args['save-clicks'])}`);
}

console.log('Saving video...');
await context.close();

const video = page.video();
if (video) {
  const savedPath = await video.path();
  fs.renameSync(savedPath, outputPath);
}

await browser.close();
console.log(`Done! Video saved to: ${outputPath}`);
