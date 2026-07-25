import { chromium } from "playwright";
import fs from "fs";

// A user who exported before the 24 fps option was removed still has fps:24 in
// clientStorage. Assigning it to the select leaves selectedIndex -1 and an empty
// value, which parsed to NaN, collapsed every frame count to NaN and rendered
// nothing — the save dialog appeared at once while the progress bar sat frozen.
const uiHtml = fs.readFileSync(new URL("../dist/ui.html", import.meta.url), "utf8");

const host = `<!doctype html><html><body>
<iframe id="f" style="width:520px;height:760px;border:0"></iframe>
<script>
  const frame = document.getElementById('f');
  window.__toPlugin = [];
  window.addEventListener('message', (e) => {
    if (e.data && e.data.pluginMessage) window.__toPlugin.push(e.data.pluginMessage);
  });
  window.__send = (m) => frame.contentWindow.postMessage({ pluginMessage: m }, '*');
</script>
</body></html>`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.setContent(host);
await page.evaluate((h) => { document.getElementById("f").srcdoc = h; }, uiHtml);
await page.waitForTimeout(1200);

await page.evaluate(() => window.__send({
  type: "settings",
  settings: { scale: 2, fallbackHoldMs: 1000, fps: 24, bitrate: 10000000, format: "mp4", source: "auto" },
}));
await page.waitForTimeout(300);

const selectState = await page.evaluate(() => {
  const sel = document.getElementById("f").contentDocument.getElementById("fps");
  return { value: sel.value, shown: sel.options[sel.selectedIndex]?.text ?? null };
});
console.log("stored fps 24 lands on:", JSON.stringify(selectState));

await page.evaluate(() => document.getElementById("f").contentDocument.getElementById("export-btn").click());
await page.waitForTimeout(300);
const sentFps = await page.evaluate(() => {
  const m = window.__toPlugin.filter((x) => x.type === "start-export").pop();
  return m ? String(m.settings.fps) : "none";
});
console.log("fps sent to the plugin:", sentFps);

const SCREENS = 4;
await page.evaluate(async (screens) => {
  const makePng = async (w, h, color) => {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    return new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer());
  };
  const pngs = [];
  for (let i = 0; i < screens; i++) pngs.push(await makePng(600, 1200, `hsl(${i * 80},80%,50%)`));

  window.__send({ type: "export-start", totalFrames: screens, canvasWidth: 300, canvasHeight: 600, scale: 2, loopToIndex: null });
  for (let i = 0; i < screens; i++) {
    window.__send({
      type: "frame-data", index: i, total: screens,
      frame: {
        id: `s${i}`, name: `Screen ${i + 1}`, width: 300, height: 600, holdDuration: 1000,
        transition: i === screens - 1 ? null : {
          type: "DISSOLVE", direction: "LEFT", matchLayers: false,
          duration: 0.5, easing: { type: "EASE_IN_AND_OUT" },
        },
        navigation: "NAVIGATE", layers: null, hasBaseImage: false, isOverlay: false, overlayPosition: null,
      },
      imageBytes: pngs[i], layerImages: [],
    });
  }
  window.__send({ type: "export-complete", hasAutoTiming: true, warnings: [] });
}, SCREENS);
await page.waitForTimeout(2500);

// Record the progress bar at the instant the download is triggered — the user's
// report was that the save dialog appeared while the bar was still partway.
await page.evaluate(() => {
  const d = document.getElementById("f").contentDocument;
  const w = document.getElementById("f").contentWindow;
  w.__downloads = [];
  const realClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      w.__downloads.push({
        name: this.download,
        href: this.href,
        progressAtDownload: d.getElementById("progress-bar").style.width,
      });
    } else realClick.call(this);
  };
  d.getElementById("render-btn").click();
});

await page.waitForFunction(() => {
  const d = document.getElementById("f").contentDocument;
  return d.getElementById("render-btn").textContent.trim() === "تصدير فيديو";
}, { timeout: 120000 });

const out = await page.evaluate(async () => {
  const d = document.getElementById("f").contentDocument;
  const w = document.getElementById("f").contentWindow;
  const dl = (w.__downloads || [])[0];
  if (!dl) return { name: null, status: d.getElementById("status").textContent };
  const blob = await (await fetch(dl.href)).blob();
  const duration = await new Promise((r) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => r(v.duration);
    v.onerror = () => r(-1);
    v.src = URL.createObjectURL(blob);
  });
  return {
    name: dl.name,
    progressAtDownload: dl.progressAtDownload,
    sizeKB: Math.round(blob.size / 1024),
    duration,
    status: d.getElementById("status").textContent,
  };
});

console.log(`\nfile:                  ${out.name}`);
console.log(`progress at download:  ${out.progressAtDownload}`);
console.log(`size:                  ${out.sizeKB} KB`);
console.log(`duration:              ${out.duration}s`);
console.log(`status:                ${JSON.stringify(out.status)}`);

// 4 screens holding 1s each plus 3 dissolves of 0.5s.
const EXPECTED = 4 * 1 + 3 * 0.5;
const ok =
  sentFps === "30" &&
  typeof out.duration === "number" &&
  Math.abs(out.duration - EXPECTED) < 0.6;
console.log(
  ok
    ? `\nPASS — ${EXPECTED}s video from a stale 24 fps setting`
    : `\nFAIL — expected ≈ ${EXPECTED}s, got ${out.duration}s`
);

console.log("\n--- errors ---");
console.log(errors.length ? errors.join("\n") : "none");
await browser.close();
