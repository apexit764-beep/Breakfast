import { chromium } from "playwright";
import fs from "fs";

// code.ts posts every frame-data and then export-complete back to back, without
// waiting for the UI to decode anything. This reproduces that exact ordering to
// check that no screen gets dropped.
const uiHtml = fs.readFileSync(
  new URL("../dist/ui.html", import.meta.url),
  "utf8"
);

const host = `<!doctype html><html><body>
<iframe id="f" style="width:520px;height:760px;border:0"></iframe>
<script>
  const frame = document.getElementById('f');
  window.__send = (msg) => frame.contentWindow.postMessage({ pluginMessage: msg }, '*');
</script>
</body></html>`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

await page.setContent(host);
await page.evaluate((html) => {
  document.getElementById("f").srcdoc = html;
}, uiHtml);
await page.waitForTimeout(1200);

const SCREENS = 7;

await page.evaluate(async (screens) => {
  const makePng = async (w, h, color) => {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    const blob = await c.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  };

  // Build every payload up front so the sends below are truly back to back.
  const payloads = [];
  for (let i = 0; i < screens; i++) {
    payloads.push(await makePng(1200, 2400, `hsl(${i * 50}, 80%, 50%)`));
  }

  window.__send({
    type: "settings",
    settings: {
      scale: 2, fallbackHoldMs: 1000, fps: 60,
      bitrate: 10000000, format: "mp4", source: "auto",
    },
  });

  window.__send({
    type: "export-start",
    totalFrames: screens, canvasWidth: 300, canvasHeight: 600,
    scale: 2, loopToIndex: null,
  });

  for (let i = 0; i < screens; i++) {
    window.__send({
      type: "frame-data",
      index: i,
      total: screens,
      frame: {
        id: `s${i}`, name: `Screen ${i + 1}`,
        width: 300, height: 600, holdDuration: 800,
        transition: i === screens - 1 ? null : {
          type: "SMART_ANIMATE", direction: "LEFT", matchLayers: false,
          duration: 0.6, easing: { type: "SLOW" },
        },
        navigation: "NAVIGATE", layers: null, hasBaseImage: false,
        isOverlay: false, overlayPosition: null,
      },
      imageBytes: payloads[i],
      layerImages: [],
    });
  }

  // Exactly what code.ts does: no pause before the completion message.
  window.__send({ type: "export-complete", hasAutoTiming: true, warnings: [] });
}, SCREENS);

await page.waitForTimeout(3000);

const state = await page.evaluate(() => {
  const d = document.getElementById("f").contentDocument;
  return {
    info: d.getElementById("frame-info").textContent,
    rows: d.getElementById("screen-list").children.length,
    status: d.getElementById("status").textContent,
  };
});

console.log(`screens sent:      ${SCREENS}`);
console.log(`screen rows in UI: ${state.rows}`);
console.log(`info text:\n${state.info}`);
console.log(`status: ${JSON.stringify(state.status)}`);
console.log(
  state.rows === SCREENS
    ? "\nPASS — every screen survived"
    : `\nFAIL — ${SCREENS - state.rows} screen(s) dropped`
);

// Export for real and measure the resulting video, since a full screen list is
// no guarantee the encoder wrote them all.
await page.evaluate(() => {
  const d = document.getElementById("f").contentDocument;
  const w = document.getElementById("f").contentWindow;
  w.__downloads = [];
  const realClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () {
    if (this.download) w.__downloads.push({ name: this.download, href: this.href });
    else realClick.call(this);
  };
  d.getElementById("render-btn").click();
});

await page.waitForFunction(
  () => {
    const d = document.getElementById("f").contentDocument;
    return d.getElementById("render-btn").textContent.trim() === "تصدير فيديو";
  },
  { timeout: 120000 }
);

const exported = await page.evaluate(async () => {
  const d = document.getElementById("f").contentDocument;
  const w = document.getElementById("f").contentWindow;
  const dl = (w.__downloads || [])[0];
  if (!dl) return { name: null, status: d.getElementById("status").textContent };

  const blob = await (await fetch(dl.href)).blob();
  const duration = await new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(v.duration);
    v.onerror = () => resolve(-1);
    v.src = URL.createObjectURL(blob);
  });

  return {
    name: dl.name,
    sizeMB: +(blob.size / (1024 * 1024)).toFixed(2),
    duration,
    status: d.getElementById("status").textContent,
  };
});

console.log(`\nexported file:  ${exported.name}`);
console.log(`size:           ${exported.sizeMB} MB`);
console.log(`video duration: ${exported.duration}s`);
console.log(`status:         ${JSON.stringify(exported.status)}`);

// 7 screens: 7 holds of 800ms plus 6 transitions of 600ms.
const EXPECTED = 7 * 0.8 + 6 * 0.6;
const ok =
  typeof exported.duration === "number" &&
  Math.abs(exported.duration - EXPECTED) < 0.6;
console.log(
  ok
    ? `\nPASS — duration ≈ expected ${EXPECTED.toFixed(1)}s`
    : `\nFAIL — expected ≈ ${EXPECTED.toFixed(1)}s, got ${exported.duration}s`
);

console.log("\n--- errors ---");
console.log(errors.length ? errors.join("\n") : "none");

await browser.close();
