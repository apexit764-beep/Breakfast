import { chromium } from '@playwright/test';
import { parseArgs } from 'node:util';
import path from 'node:path';

const { values: args } = parseArgs({
  options: {
    url:      { type: 'string',  short: 'u' },
    output:   { type: 'string',  short: 'o', default: 'prototype.webm' },
    maxdur:   { type: 'string',  short: 'm', default: '120' },
    idle:     { type: 'string',  short: 'i', default: '5' },
    pause:    { type: 'string',  short: 'p', default: '2' },
    width:    { type: 'string',  short: 'w', default: '1920' },
    height:   { type: 'string',  short: 'h', default: '1080' },
    scale:    { type: 'string',  short: 's', default: '1' },
    manual:   { type: 'boolean', default: false },
    headless: { type: 'boolean', default: false },
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
    -w, --width     Viewport width (default: 1920)
    -h, --height    Viewport height (default: 1080)
    -s, --scale     Device scale factor (default: 1)
    --manual        You click manually in the browser, script only records
    --headless      Run without visible browser

  Examples:
    node record.js -u "https://figma.com/proto/..."
    node record.js -u "https://figma.com/proto/..." --manual
    node record.js -u "https://figma.com/proto/..." -p 3 -w 1280 -h 720
  `);
  process.exit(0);
}

const width = parseInt(args.width);
const height = parseInt(args.height);
const maxDuration = parseInt(args.maxdur) * 1000;
const idleTimeout = parseInt(args.idle) * 1000;
const clickPause = parseInt(args.pause) * 1000;
const scale = parseFloat(args.scale);
const outputPath = path.resolve(args.output);
const isManual = args.manual;

// Force clean prototype view via URL params
const protoUrl = new URL(args.url);
protoUrl.searchParams.set('scaling', 'scale-down');
protoUrl.searchParams.set('content-scaling', 'fixed');
protoUrl.searchParams.set('hide-ui', '1');
protoUrl.searchParams.set('hotspot-hints', '0');
const finalUrl = protoUrl.toString();

console.log(`Recording: ${finalUrl}`);
console.log(`Output:    ${outputPath}`);
console.log(`Mode:      ${isManual ? 'Manual (you click)' : 'Auto (clicks center every ' + args.pause + 's)'}`);
console.log(`Max:       ${args.maxdur}s`);
console.log(`Idle stop: ${args.idle}s of no change`);
console.log(`Viewport:  ${width}x${height} @${scale}x`);
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
    size: { width, height },
  },
});

const page = await context.newPage();
await page.goto(finalUrl, { waitUntil: 'load', timeout: 60_000 });
await page.waitForTimeout(3000);

// Hide cursor
await page.evaluate(() => {
  const style = document.createElement('style');
  style.textContent = '* { cursor: none !important; }';
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

let previousShot = await page.screenshot({ type: 'png' });
let idleStart = null;
let lastClickTime = 0;
const startTime = Date.now();
let stopReason = '';

while (Date.now() - startTime < maxDuration) {
  if (manualStop) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    stopReason = `Stopped manually after ${elapsed}s`;
    break;
  }

  const now = Date.now();

  // Auto-click only in auto mode
  if (!isManual && now - lastClickTime >= clickPause) {
    await page.mouse.click(width / 2, height / 2);
    lastClickTime = now;
  }

  await page.waitForTimeout(400);

  const currentShot = await page.screenshot({ type: 'png' });
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
  const fs = await import('node:fs');
  fs.renameSync(savedPath, outputPath);
}

await browser.close();
console.log(`Done! Video saved to: ${outputPath}`);
