import { chromium } from "playwright";
import fs from "fs";

// Drives dist/ui.html in a headless browser with stand-in plugin messages, so
// the UI half can be exercised without Figma. Needs: npm i --no-save playwright
const uiHtml = fs.readFileSync(
  new URL("../dist/ui.html", import.meta.url),
  "utf8"
);

const host = `<!doctype html><html><body>
<iframe id="f" style="width:520px;height:760px;border:0"></iframe>
<script>
  window.__toPlugin = [];
  const frame = document.getElementById('f');
  window.addEventListener('message', (e) => {
    if (e.data && e.data.pluginMessage) window.__toPlugin.push(e.data.pluginMessage);
  });
  window.__send = (msg) => frame.contentWindow.postMessage({ pluginMessage: msg }, '*');
  window.__ready = new Promise((r) => { frame.onload = () => r(true); });
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
  const f = document.getElementById("f");
  f.srcdoc = html;
}, uiHtml);
await page.waitForTimeout(1500);

const report = (label, value) => console.log(`${label}: ${value}`);

// 1. Did the UI script load and attach its handlers?
const scriptLoaded = await page.evaluate(() =>
  document.getElementById("f").contentWindow.onmessage !== null
);
report("UI script attached window.onmessage", scriptLoaded);

const sentOnLoad = await page.evaluate(() => window.__toPlugin.map((m) => m.type));
report("messages sent to plugin on load", JSON.stringify(sentOnLoad));

// 2. Feed it settings, as code.ts does.
await page.evaluate(() =>
  window.__send({
    type: "settings",
    settings: {
      scale: 2, fallbackHoldMs: 1000, fps: 30,
      bitrate: 10000000, format: "mp4", source: "auto",
    },
  })
);
await page.waitForTimeout(300);

const scaleValue = await page.evaluate(() =>
  document.getElementById("f").contentDocument.getElementById("scale").value
);
report("settings applied to UI (scale)", scaleValue);

// 3. Click "read prototype" and see what it posts.
await page.evaluate(() =>
  document.getElementById("f").contentDocument.getElementById("export-btn").click()
);
await page.waitForTimeout(300);
const afterClick = await page.evaluate(() => window.__toPlugin.map((m) => m.type));
report("messages after clicking read", JSON.stringify(afterClick));

// 4. Simulate a two-screen flow with real PNG bytes.
await page.evaluate(async () => {
  const makePng = async (w, h, color) => {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    const blob = await c.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  };

  window.__send({
    type: "export-start",
    totalFrames: 2, canvasWidth: 200, canvasHeight: 400, scale: 2, loopToIndex: null,
  });

  const spec = (name, transition) => ({
    id: name, name, width: 200, height: 400, holdDuration: 500,
    transition, navigation: "NAVIGATE", layers: null, hasBaseImage: false,
    isOverlay: false, overlayPosition: null,
  });

  window.__send({
    type: "frame-data", index: 0, total: 2,
    frame: spec("Screen A", {
      type: "SMART_ANIMATE", direction: "LEFT", matchLayers: false,
      duration: 0.3, easing: { type: "EASE_IN_AND_OUT" },
    }),
    imageBytes: await makePng(400, 800, "#ff0000"),
    layerImages: [],
  });

  window.__send({
    type: "frame-data", index: 1, total: 2,
    frame: spec("Screen B", null),
    imageBytes: await makePng(400, 800, "#0000ff"),
    layerImages: [],
  });
});
await page.waitForTimeout(600);

await page.evaluate(() =>
  window.__send({ type: "export-complete", hasAutoTiming: true, warnings: [] })
);
await page.waitForTimeout(600);

// 5. Is the export button actually visible now?
const ui = async (fn) => page.evaluate(fn);
const state = await ui(() => {
  const d = document.getElementById("f").contentDocument;
  const vis = (id) => {
    const n = d.getElementById(id);
    if (!n) return "MISSING";
    return n.offsetParent !== null ? "visible" : "hidden";
  };
  return {
    renderSection: vis("render-section"),
    renderBtn: vis("render-btn"),
    previewBtn: vis("preview-btn"),
    info: d.getElementById("frame-info").textContent,
    status: d.getElementById("status").textContent,
  };
});
report("render-section", state.renderSection);
report("EXPORT BUTTON", state.renderBtn);
report("preview button", state.previewBtn);
report("info text", JSON.stringify(state.info));
report("status text", JSON.stringify(state.status));

// 5b. Preview and the screen list toggle.
await ui(() => document.getElementById("f").contentDocument.getElementById("preview-btn").click());
await page.waitForTimeout(1200);
const preview = await ui(() => {
  const d = document.getElementById("f").contentDocument;
  const c = d.getElementById("preview-canvas");
  const ctx = c.getContext("2d");
  let painted = false;
  try {
    const data = ctx.getImageData(0, 0, Math.min(c.width,8), Math.min(c.height,8)).data;
    for (let i = 0; i < data.length; i += 4) if (data[i] || data[i+1] || data[i+2]) { painted = true; break; }
  } catch (e) { painted = "error: " + e.message; }
  return {
    section: d.getElementById("preview-section").offsetParent !== null ? "visible" : "hidden",
    stopBtn: d.getElementById("stop-preview-btn").offsetParent !== null ? "visible" : "hidden",
    size: c.width + "x" + c.height,
    painted,
  };
});
report("preview-section", preview.section);
report("preview canvas size", preview.size);
report("preview canvas painted", preview.painted);
report("stop-preview button", preview.stopBtn);

await ui(() => document.getElementById("f").contentDocument.getElementById("toggle-list").click());
await page.waitForTimeout(200);
const listState = await ui(() => {
  const d = document.getElementById("f").contentDocument;
  return {
    list: d.getElementById("screen-list").offsetParent !== null ? "visible" : "hidden",
    rows: d.querySelectorAll ? d.getElementById("screen-list").children.length : -1,
    label: d.getElementById("toggle-list").textContent.trim(),
  };
});
report("screen list after 1 click", listState.list + " (" + listState.rows + " rows, label: " + listState.label + ")");

await page.waitForTimeout(2500);

// 6. Does exporting actually produce a video file?
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
await page.waitForTimeout(9000);

const result = await ui(() => {
  const d = document.getElementById("f").contentDocument;
  const w = document.getElementById("f").contentWindow;
  return {
    downloads: (w.__downloads || []).map((x) => x.name),
    status: d.getElementById("status").textContent,
    btn: d.getElementById("render-btn").textContent,
  };
});
report("downloads", JSON.stringify(result.downloads));
report("export status", JSON.stringify(result.status));
report("button text after", JSON.stringify(result.btn));

console.log("\n--- errors ---");
console.log(errors.length ? errors.join("\n") : "none");

await browser.close();
