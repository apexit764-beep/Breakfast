import {
  DEFAULT_SETTINGS,
  FrameSpec,
  PluginSettings,
} from "./shared/types";
import { createSink, evenDimension, isMp4Supported } from "./ui/encoder";
import {
  countOutputFrames,
  LoadedFrame,
  LoadedLayer,
  renderSequence,
  Scene,
} from "./ui/render";

let scene: Scene | null = null;
let exportScale = 4;
let blobUrls: string[] = [];
/** Indexed by the sender's frame index, so order never depends on decode speed. */
let pending: (LoadedFrame | null)[] = [];
/** One entry per in-flight frame decode; finishScene waits on all of them. */
let decodeJobs: Promise<void>[] = [];
let droppedFrames: string[] = [];
let previewAbort: AbortController | null = null;
let renderAbort: AbortController | null = null;
let previewLoop = false;
let settings: PluginSettings = { ...DEFAULT_SETTINGS };

// --- Element helpers -----------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

/**
 * Sections default to `display: none` in the stylesheet, so showing them needs
 * an explicit value — clearing the inline style just falls back to hidden.
 */
function show(id: string, visible: boolean, display = "block"): void {
  el(id).style.display = visible ? display : "none";
}

function isVisible(id: string): boolean {
  return getComputedStyle(el(id)).display !== "none";
}

// --- Messaging -----------------------------------------------------------

window.onmessage = async (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case "settings":
      settings = msg.settings;
      applySettings();
      break;

    case "progress":
      updateProgress(msg.message, msg.current, msg.total);
      break;

    case "error":
      showStatus(msg.message, "error");
      setBusy(false);
      break;

    case "export-start":
      resetScene(msg);
      break;

    case "frame-data":
      receiveFrame(msg);
      break;

    case "export-complete":
      await finishScene(msg.hasAutoTiming, msg.warnings || []);
      break;
  }
};

function resetScene(msg: {
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  loopToIndex: number | null;
}): void {
  releaseUrls();
  pending = [];
  decodeJobs = [];
  droppedFrames = [];
  exportScale = msg.scale;
  scene = {
    frames: [],
    loopToIndex: msg.loopToIndex,
    width: msg.canvasWidth,
    height: msg.canvasHeight,
  };
  show("render-section", false);
  show("preview-section", false);
}

/**
 * Decoding is async but the sandbox sends every frame — then export-complete —
 * without pausing, so the work is registered here and awaited in finishScene.
 * Frames land at their sender-assigned index so slow decodes can't reorder them.
 */
function receiveFrame(msg: {
  index?: number;
  frame: FrameSpec;
  imageBytes: unknown;
  layerImages: unknown[];
}): void {
  const index = typeof msg.index === "number" ? msg.index : decodeJobs.length;

  decodeJobs.push(
    (async () => {
      let layers: LoadedLayer[] | null = null;

      if (msg.frame.layers) {
        const images = await Promise.all(
          (msg.layerImages || []).map((bytes) => decodeImageOrNull(bytes))
        );
        // One unrenderable layer must not cost us the whole screen.
        const loaded: LoadedLayer[] = [];
        for (const layer of msg.frame.layers) {
          const image = images[layer.imageIndex];
          if (!image) continue;
          loaded.push({
            key: layer.key,
            rect: layer.rect,
            opacity: layer.opacity,
            rotation: layer.rotation,
            hash: layer.hash,
            image,
          });
        }
        layers = loaded.length > 0 ? loaded : null;
      }

      let image = await decodeImageOrNull(msg.imageBytes);
      if (!image && layers) {
        // A frame whose background rendered empty can still show its layers.
        image = await transparentImage();
      }
      if (!image) {
        droppedFrames.push(msg.frame.name);
        return;
      }

      pending[index] = { spec: msg.frame, image, layers };
    })()
  );
}

async function finishScene(
  hasAutoTiming: boolean,
  warnings: string[]
): Promise<void> {
  // Every frame is still decoding at this point; none of them are usable yet.
  await Promise.all(decodeJobs);
  decodeJobs = [];

  const frames = pending.filter((f): f is LoadedFrame => f != null);
  pending = [];

  if (!scene || frames.length === 0) {
    showStatus("ما وصلت أي شاشات صالحة.", "error");
    setBusy(false);
    return;
  }

  if (droppedFrames.length > 0) {
    warnings = warnings.concat(
      `تعذّر تحميل ${droppedFrames.length} شاشة: ${droppedFrames.join("، ")}`
    );
  }

  scene.frames = frames;

  const fps = settings.fps;
  const totalFrames = countOutputFrames(scene, fps);
  const seconds = (totalFrames / fps).toFixed(1);
  const smart = scene.frames.filter((f) => f.layers).length;

  const lines = [
    `${scene.frames.length} شاشات · ${scene.width}×${scene.height} · ${exportScale}x`,
    `مدة الفيديو ≈ ${seconds} ثانية · ${fps} إطار/ثانية`,
    hasAutoTiming ? "التوقيت مقروء من البروتوتايب" : "التوقيت من المدة الاحتياطية",
  ];
  if (smart > 0) lines.push(`Smart Animate مفعّل على ${smart} شاشة`);
  if (scene.loopToIndex != null) lines.push("البروتوتايب بيرجع لأوله (loop)");

  el("frame-info").textContent = lines.join("\n");
  renderScreenList();

  show("render-section", true);
  show("progress-area", false);
  showStatus(warnings.join("\n"), warnings.length ? "warn" : null);
  setBusy(false);
}

function renderScreenList(): void {
  if (!scene) return;
  const list = el("screen-list");
  list.innerHTML = "";

  scene.frames.forEach((frame, i) => {
    const row = document.createElement("div");
    row.className = "screen-row";

    const name = document.createElement("span");
    name.className = "screen-name";
    name.textContent = `${i + 1}. ${frame.spec.name}`;

    const meta = document.createElement("span");
    meta.className = "screen-meta";
    const transition = frame.spec.transition;
    const parts = [`${Math.round(frame.spec.holdDuration)}ms`];
    if (transition) {
      parts.push(`${transitionLabel(transition.type)} ${transition.duration}s`);
    }
    if (frame.layers) parts.push(`${frame.layers.length} طبقة`);
    meta.textContent = parts.join(" · ");

    row.append(name, meta);
    list.appendChild(row);
  });
}

function transitionLabel(type: string): string {
  const labels: Record<string, string> = {
    DISSOLVE: "تلاشي",
    SMART_ANIMATE: "Smart Animate",
    SCROLL_ANIMATE: "تمرير",
    MOVE_IN: "دخول",
    MOVE_OUT: "خروج",
    PUSH: "دفع",
    SLIDE_IN: "انزلاق داخل",
    SLIDE_OUT: "انزلاق خارج",
  };
  return labels[type] || type;
}

// --- Image decoding ------------------------------------------------------

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value && typeof value === "object") {
    return new Uint8Array(Object.values(value as Record<string, number>));
  }
  return new Uint8Array(0);
}

function decodeImage(value: unknown): Promise<HTMLImageElement> {
  const bytes = toUint8Array(value);
  if (bytes.length === 0) return Promise.reject(new Error("empty image"));

  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "image/png" })
  );
  blobUrls.push(url);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = url;
  });
}

/** Decode that reports failure as null instead of rejecting. */
function decodeImageOrNull(value: unknown): Promise<HTMLImageElement | null> {
  return decodeImage(value).then(
    (img) => img,
    () => null
  );
}

let transparentPixel: Promise<HTMLImageElement> | null = null;

/** 1x1 transparent PNG, used as a stand-in background behind live layers. */
function transparentImage(): Promise<HTMLImageElement> {
  if (!transparentPixel) {
    transparentPixel = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("placeholder failed"));
      img.src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    });
  }
  return transparentPixel;
}

function releaseUrls(): void {
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls = [];
}

// --- Preview -------------------------------------------------------------

async function runPreview(): Promise<void> {
  if (!scene || scene.frames.length === 0) return;

  previewAbort?.abort();
  previewAbort = new AbortController();
  const signal = previewAbort.signal;

  show("preview-section", true);
  show("preview-btn", false);
  show("stop-preview-btn", true);

  const canvas = el<HTMLCanvasElement>("preview-canvas");
  // Previewing at 1x keeps playback smooth regardless of export quality.
  const previewScale = Math.min(1, 440 / scene.width);
  canvas.width = Math.round(scene.width * previewScale);
  canvas.height = Math.round(scene.height * previewScale);
  canvas.style.width = `${canvas.width}px`;

  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Pace against the wall clock so the preview runs at the video's real speed
  // rather than the display's refresh rate.
  const frameInterval = 1000 / settings.fps;
  let deadline = performance.now();
  const emit = () => {
    deadline += frameInterval;
    const wait = deadline - performance.now();
    if (wait > 1) {
      return new Promise<void>((r) => setTimeout(r, wait));
    }
    // Running behind: yield without sleeping so we catch up.
    deadline = Math.max(deadline, performance.now());
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  };

  do {
    deadline = performance.now();
    await renderSequence({
      scene,
      ctx,
      scale: previewScale,
      fps: settings.fps,
      emit,
      signal,
    });
  } while (previewLoop && !signal.aborted);

  if (!signal.aborted) stopPreview();
}

function stopPreview(): void {
  previewAbort?.abort();
  previewAbort = null;
  show("stop-preview-btn", false);
  show("preview-btn", true);
}

// --- Export --------------------------------------------------------------

async function exportVideo(): Promise<void> {
  if (!scene || scene.frames.length === 0) return;

  previewAbort?.abort();
  renderAbort = new AbortController();
  const signal = renderAbort.signal;

  const renderBtn = el<HTMLButtonElement>("render-btn");
  renderBtn.disabled = true;
  renderBtn.textContent = "جاري إنشاء الفيديو...";
  show("cancel-render-btn", true);
  showStatus("", null);

  const width = evenDimension(Math.round(scene.width * exportScale));
  const height = evenDimension(Math.round(scene.height * exportScale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const fps = settings.fps;
  const totalFrames = countOutputFrames(scene, fps);
  let emitted = 0;

  try {
    const sink = await createSink(settings.format, {
      source: canvas,
      width,
      height,
      fps,
      bitrate: settings.bitrate,
    });

    signal.addEventListener("abort", () => sink.abort());

    await renderSequence({
      scene,
      ctx,
      scale: exportScale,
      fps,
      emit: async () => {
        await sink.addFrame();
        emitted++;
        if (emitted % 5 === 0) {
          updateProgress(
            `ترميز الفيديو: ${Math.round((emitted / totalFrames) * 100)}%`,
            emitted,
            totalFrames
          );
        }
      },
      signal,
    });

    if (signal.aborted) {
      sink.abort();
      showStatus("تم إلغاء التصدير.", "warn");
      return;
    }

    const result = await sink.finish();
    downloadBlob(result.blob, `prototype-export.${result.extension}`);

    const sizeMB = (result.blob.size / (1024 * 1024)).toFixed(1);
    const note = result.note ? `\n${result.note}` : "";
    showStatus(
      `تم التصدير بنجاح — ${result.format.toUpperCase()} · ${sizeMB} MB${note}`,
      "success"
    );
  } catch (e) {
    showStatus(
      `فشل التصدير:\n${e instanceof Error ? e.message : String(e)}`,
      "error"
    );
  } finally {
    renderAbort = null;
    renderBtn.disabled = false;
    renderBtn.textContent = "تصدير فيديو";
    show("cancel-render-btn", false);
    show("progress-area", false);
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --- Status and progress -------------------------------------------------

function updateProgress(message: string, current: number, total: number): void {
  show("progress-area", true);
  el("progress-bar").style.width = `${Math.min((current / total) * 100, 100)}%`;
  el("progress-text").textContent = message;
}

function showStatus(message: string, kind: "error" | "success" | "warn" | null): void {
  const node = el("status");
  if (!message || !kind) {
    node.style.display = "none";
    return;
  }
  node.textContent = message;
  node.className = `status ${kind}`;
  node.style.display = "block";
}

function setBusy(busy: boolean): void {
  el<HTMLButtonElement>("export-btn").disabled = busy;
  el<HTMLButtonElement>("export-btn").textContent = busy
    ? "جاري القراءة..."
    : "قراءة البروتوتايب";
}

// --- Settings ------------------------------------------------------------

function applySettings(): void {
  el<HTMLSelectElement>("scale").value = String(settings.scale);
  el<HTMLSelectElement>("fps").value = String(settings.fps);
  el<HTMLSelectElement>("bitrate").value = String(settings.bitrate);
  el<HTMLSelectElement>("format").value = settings.format;
  el<HTMLSelectElement>("source").value = settings.source;
  el<HTMLInputElement>("hold-duration").value = String(settings.fallbackHoldMs);
}

function collectSettings(): PluginSettings {
  return {
    scale: parseInt(el<HTMLSelectElement>("scale").value),
    fps: parseInt(el<HTMLSelectElement>("fps").value),
    bitrate: parseInt(el<HTMLSelectElement>("bitrate").value),
    format: el<HTMLSelectElement>("format").value as "mp4" | "webm",
    source: el<HTMLSelectElement>("source").value as PluginSettings["source"],
    fallbackHoldMs: parseInt(el<HTMLInputElement>("hold-duration").value) || 1000,
  };
}

// --- Init ----------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  if (!isMp4Supported()) {
    el("format-note").textContent =
      "متصفحك ما بيدعم MP4 — راح يتم التصدير بصيغة WebM.";
  }

  el("export-btn").addEventListener("click", () => {
    settings = collectSettings();
    setBusy(true);
    showStatus("", null);
    parent.postMessage(
      { pluginMessage: { type: "start-export", settings } },
      "*"
    );
  });

  el("preview-btn").addEventListener("click", () => runPreview());
  el("stop-preview-btn").addEventListener("click", () => stopPreview());
  el("render-btn").addEventListener("click", () => exportVideo());
  el("cancel-render-btn").addEventListener("click", () => renderAbort?.abort());

  el<HTMLInputElement>("loop-preview").addEventListener("change", (e) => {
    previewLoop = (e.target as HTMLInputElement).checked;
  });

  el("toggle-list").addEventListener("click", () => {
    const open = isVisible("screen-list");
    show("screen-list", !open);
    el("toggle-list").textContent = open ? "عرض الشاشات ▾" : "إخفاء الشاشات ▴";
  });

  el("cancel-btn").addEventListener("click", () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  });

  parent.postMessage({ pluginMessage: { type: "ui-ready" } }, "*");
});
