import { chromium } from '@playwright/test';
import { parseArgs } from 'node:util';
import path from 'node:path';

const { values: args } = parseArgs({
  options: {
    url:      { type: 'string',  short: 'u' },
    output:   { type: 'string',  short: 'o', default: 'prototype.webm' },
    duration: { type: 'string',  short: 'd', default: '15' },
    width:    { type: 'string',  short: 'w', default: '1920' },
    height:   { type: 'string',  short: 'h', default: '1080' },
    scale:    { type: 'string',  short: 's', default: '1' },
    cursor:   { type: 'boolean', short: 'c', default: true },
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
    -d, --duration  Recording duration in seconds (default: 15)
    -w, --width     Viewport width (default: 1920)
    -h, --height    Viewport height (default: 1080)
    -s, --scale     Device scale factor (default: 1)
    -c, --cursor    Show cursor (default: true)

  Examples:
    node record.js -u "https://figma.com/proto/..." -d 20
    node record.js -u "https://figma.com/proto/..." -o demo.webm -w 1280 -h 720
  `);
  process.exit(0);
}

const width = parseInt(args.width);
const height = parseInt(args.height);
const duration = parseInt(args.duration) * 1000;
const scale = parseFloat(args.scale);
const outputPath = path.resolve(args.output);

console.log(`Recording: ${args.url}`);
console.log(`Output:    ${outputPath}`);
console.log(`Duration:  ${args.duration}s`);
console.log(`Viewport:  ${width}x${height} @${scale}x`);
console.log();

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  headless: args.headless,
  args: [
    '--no-sandbox',
    ...(args.cursor === false ? ['--cursor=none'] : []),
  ],
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

console.log('Opening prototype...');
await page.goto(args.url, { waitUntil: 'networkidle', timeout: 60_000 });

// Wait for Figma prototype to fully load
await page.waitForTimeout(3000);

// Hide Figma toolbar/UI chrome for clean recording
await page.evaluate(() => {
  const selectors = [
    '[class*="toolbar"]',
    '[class*="Toolbar"]',
    '[data-testid="prototype-toolbar"]',
    '[class*="hotspot-hint"]',
  ];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => {
      el.style.display = 'none';
    });
  }
});

// Click to start the prototype if needed
await page.mouse.click(width / 2, height / 2);
await page.waitForTimeout(500);

console.log(`Recording for ${args.duration}s...`);
await page.waitForTimeout(duration);

console.log('Stopping recording...');
await context.close();

// Playwright saves video with a random name — rename it
const video = page.video();
if (video) {
  const savedPath = await video.path();
  const fs = await import('node:fs');
  fs.renameSync(savedPath, outputPath);
}

await browser.close();
console.log(`Done! Video saved to: ${outputPath}`);
