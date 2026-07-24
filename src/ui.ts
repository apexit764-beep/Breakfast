interface FrameData {
  id: string;
  name: string;
  width: number;
  height: number;
  transition: {
    type: string;
    direction: string;
    duration: number;
    easing: string;
  } | null;
  holdDuration: number;
}

const FPS = 60;

const EASING_FUNCTIONS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  "ease-in": (t) => t * t * t,
  "ease-out": (t) => 1 - Math.pow(1 - t, 3),
  "ease-in-out": (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  "ease-in-back": (t) => {
    const c = 1.70158;
    return (c + 1) * t * t * t - c * t * t;
  },
  "ease-out-back": (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  "ease-in-out-back": (t) => {
    const c = 1.70158 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
  gentle: (t) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
};

function getEasing(name: string): (t: number) => number {
  return EASING_FUNCTIONS[name] || EASING_FUNCTIONS["ease-in-out"];
}

let loadedImages: HTMLImageElement[] = [];
let blobUrls: string[] = [];
let framesData: FrameData[] = [];
let canvasWidth = 0;
let canvasHeight = 0;
let exportScale = 4;
let previewAbort: AbortController | null = null;
let renderAbort: AbortController | null = null;

window.onmessage = async (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === "progress") {
    updateProgress(msg.message, msg.current, msg.total);
  }

  if (msg.type === "error") {
    showError(msg.message);
  }

  if (msg.type === "export-start") {
    cleanup();
    canvasWidth = msg.canvasWidth;
    canvasHeight = msg.canvasHeight;
    exportScale = msg.scale;
    framesData = [];
    loadedImages = [];
    blobUrls = [];
  }

  if (msg.type === "frame-data") {
    const bytes = toUint8Array(msg.imageBytes);
    if (bytes.length === 0) {
      showError("فشل استقبال بيانات الصور من فيجما.");
      return;
    }
    const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    try {
      const img = await loadImage(url);
      loadedImages.push(img);
      framesData.push(msg.frame);
    } catch {
      showError(`فشل تحميل صورة الشاشة "${msg.frame.name}".`);
    }
  }

  if (msg.type === "export-complete") {
    showRenderReady(msg.hasAutoTiming);
  }
};

function cleanup() {
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls = [];
  loadedImages = [];
  framesData = [];
}

// Figma delivers a Uint8Array, but stay tolerant of other serializations.
function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value && typeof value === "object") {
    return new Uint8Array(Object.values(value as Record<string, number>));
  }
  return new Uint8Array(0);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// --- Drawing transitions ---

function drawTransition(
  ctx: CanvasRenderingContext2D,
  fromImg: HTMLImageElement,
  toImg: HTMLImageElement,
  type: string,
  direction: string,
  t: number,
  w: number,
  h: number
): void {
  switch (type) {
    case "DISSOLVE":
    case "SMART_ANIMATE":
      ctx.globalAlpha = 1;
      ctx.drawImage(fromImg, 0, 0, w, h);
      ctx.globalAlpha = t;
      ctx.drawImage(toImg, 0, 0, w, h);
      ctx.globalAlpha = 1;
      break;

    case "MOVE_IN":
      ctx.drawImage(fromImg, 0, 0, w, h);
      drawSlideIn(ctx, toImg, direction, t, w, h);
      break;

    case "MOVE_OUT":
      ctx.drawImage(toImg, 0, 0, w, h);
      drawSlideOut(ctx, fromImg, direction, t, w, h);
      break;

    case "PUSH":
      drawPush(ctx, fromImg, toImg, direction, t, w, h);
      break;

    case "SLIDE_IN":
      ctx.drawImage(fromImg, 0, 0, w, h);
      drawSlideIn(ctx, toImg, direction, t, w, h);
      break;

    case "SLIDE_OUT":
      ctx.drawImage(toImg, 0, 0, w, h);
      drawSlideOut(ctx, fromImg, direction, t, w, h);
      break;

    default:
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(fromImg, 0, 0, w, h);
      ctx.globalAlpha = t;
      ctx.drawImage(toImg, 0, 0, w, h);
      ctx.globalAlpha = 1;
      break;
  }
}

function drawSlideIn(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  dir: string, t: number, w: number, h: number
): void {
  let x = 0, y = 0;
  switch (dir) {
    case "LEFT": x = w * (1 - t); break;
    case "RIGHT": x = -w * (1 - t); break;
    case "TOP": y = h * (1 - t); break;
    case "BOTTOM": y = -h * (1 - t); break;
  }
  ctx.drawImage(img, x, y, w, h);
}

function drawSlideOut(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  dir: string, t: number, w: number, h: number
): void {
  let x = 0, y = 0;
  switch (dir) {
    case "LEFT": x = -w * t; break;
    case "RIGHT": x = w * t; break;
    case "TOP": y = -h * t; break;
    case "BOTTOM": y = h * t; break;
  }
  ctx.drawImage(img, x, y, w, h);
}

function drawPush(
  ctx: CanvasRenderingContext2D, fromImg: HTMLImageElement,
  toImg: HTMLImageElement, dir: string, t: number, w: number, h: number
): void {
  switch (dir) {
    case "LEFT":
      ctx.drawImage(fromImg, -w * t, 0, w, h);
      ctx.drawImage(toImg, w * (1 - t), 0, w, h);
      break;
    case "RIGHT":
      ctx.drawImage(fromImg, w * t, 0, w, h);
      ctx.drawImage(toImg, -w * (1 - t), 0, w, h);
      break;
    case "TOP":
      ctx.drawImage(fromImg, 0, -h * t, w, h);
      ctx.drawImage(toImg, 0, h * (1 - t), w, h);
      break;
    case "BOTTOM":
      ctx.drawImage(fromImg, 0, h * t, w, h);
      ctx.drawImage(toImg, 0, -h * (1 - t), w, h);
      break;
  }
}

// --- Shared render loop (used by both preview and export) ---

interface RenderTarget {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  onFrame: () => void;
  onProgress?: (done: number, total: number) => void;
  signal: AbortSignal;
}

async function renderLoop(target: RenderTarget): Promise<void> {
  const { ctx, w, h, onFrame, onProgress, signal } = target;

  for (let i = 0; i < loadedImages.length; i++) {
    if (signal.aborted) return;
    if (onProgress) onProgress(i, loadedImages.length);

    const frame = framesData[i];
    const img = loadedImages[i];

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    onFrame();

    // Hold
    const holdFrameCount = Math.max(Math.round((frame.holdDuration / 1000) * FPS), 1);
    for (let f = 1; f < holdFrameCount; f++) {
      if (signal.aborted) return;
      onFrame();
      await nextTick();
    }

    // Transition to next
    if (i < loadedImages.length - 1) {
      const nextImg = loadedImages[i + 1];
      const trans = frame.transition;

      if (trans && trans.duration > 0) {
        const totalTransFrames = Math.max(Math.round(trans.duration * FPS), 1);
        const easingFn = getEasing(trans.easing);

        for (let f = 0; f <= totalTransFrames; f++) {
          if (signal.aborted) return;
          const t = easingFn(f / totalTransFrames);
          ctx.clearRect(0, 0, w, h);
          drawTransition(ctx, img, nextImg, trans.type, trans.direction, t, w, h);
          onFrame();
          await nextTick();
        }
      }
    }
  }
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// --- Preview ---

async function runPreview(): Promise<void> {
  if (loadedImages.length === 0) return;

  if (previewAbort) previewAbort.abort();
  previewAbort = new AbortController();

  const previewSection = document.getElementById("preview-section")!;
  const previewCanvas = document.getElementById("preview-canvas") as HTMLCanvasElement;
  const previewBtn = document.getElementById("preview-btn") as HTMLButtonElement;
  const stopBtn = document.getElementById("stop-preview-btn") as HTMLButtonElement;

  previewSection.style.display = "block";

  const maxW = 440;
  const aspect = canvasHeight / canvasWidth;
  const displayW = Math.min(maxW, canvasWidth);
  const displayH = Math.round(displayW * aspect);

  previewCanvas.width = canvasWidth;
  previewCanvas.height = canvasHeight;
  previewCanvas.style.width = displayW + "px";
  previewCanvas.style.height = displayH + "px";

  const ctx = previewCanvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  previewBtn.style.display = "none";
  stopBtn.style.display = "block";

  const target: RenderTarget = {
    ctx,
    w: canvasWidth,
    h: canvasHeight,
    onFrame: () => {},
    signal: previewAbort.signal,
  };

  await renderLoop(target);

  stopBtn.style.display = "none";
  previewBtn.style.display = "block";
}

function stopPreview() {
  if (previewAbort) {
    previewAbort.abort();
    previewAbort = null;
  }
  const stopBtn = document.getElementById("stop-preview-btn") as HTMLButtonElement;
  const previewBtn = document.getElementById("preview-btn") as HTMLButtonElement;
  stopBtn.style.display = "none";
  previewBtn.style.display = "block";
}

// --- Video export ---

function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    (MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ||
      MediaRecorder.isTypeSupported("video/webm;codecs=vp8"))
  );
}

async function renderVideo(): Promise<void> {
  if (loadedImages.length === 0) return;

  if (!isRecordingSupported()) {
    showError(
      "متصفحك ما بيدعم تسجيل الفيديو (MediaRecorder/WebM).\n" +
        "استخدم تطبيق فيجما للديسكتوب أو متصفح Chrome."
    );
    return;
  }

  if (previewAbort) previewAbort.abort();
  renderAbort = new AbortController();

  const renderBtn = document.getElementById("render-btn") as HTMLButtonElement;
  const cancelRenderBtn = document.getElementById("cancel-render-btn") as HTMLButtonElement;
  renderBtn.disabled = true;
  renderBtn.textContent = "جاري إنشاء الفيديو...";
  cancelRenderBtn.style.display = "block";

  const w = canvasWidth * exportScale;
  const h = canvasHeight * exportScale;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const bitrateSelect = document.getElementById("bitrate") as HTMLSelectElement;
  const bitrate = parseInt(bitrateSelect.value);

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as any;

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm;codecs=vp8";

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const videoReady = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });

  recorder.start();

  const target: RenderTarget = {
    ctx,
    w,
    h,
    onFrame: () => { if (track.requestFrame) track.requestFrame(); },
    onProgress: (done, total) =>
      updateProgress(`جاري إنشاء الفيديو: ${done + 1}/${total}`, done + 1, total),
    signal: renderAbort.signal,
  };

  await renderLoop(target);

  recorder.stop();

  if (renderAbort.signal.aborted) {
    cancelRenderBtn.style.display = "none";
    renderBtn.disabled = false;
    renderBtn.textContent = "تصدير فيديو";
    showError("تم إلغاء التصدير");
    return;
  }

  const videoBlob = await videoReady;

  const url = URL.createObjectURL(videoBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "prototype-export.webm";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const sizeMB = (videoBlob.size / (1024 * 1024)).toFixed(1);

  cancelRenderBtn.style.display = "none";
  renderBtn.disabled = false;
  renderBtn.textContent = "تصدير فيديو";

  showSuccess(`تم تصدير الفيديو بنجاح (${sizeMB} MB)`);
}

function cancelRender() {
  if (renderAbort) {
    renderAbort.abort();
    renderAbort = null;
  }
}

// --- UI helpers ---

function updateProgress(message: string, current: number, total: number): void {
  const el = document.getElementById("progress-area")!;
  const bar = document.getElementById("progress-bar")!;
  const text = document.getElementById("progress-text")!;
  el.style.display = "block";
  bar.style.width = `${(current / total) * 100}%`;
  text.textContent = message;
}

function showError(message: string): void {
  const el = document.getElementById("status")!;
  el.textContent = message;
  el.className = "status error";
  el.style.display = "block";
}

function showSuccess(message: string): void {
  const el = document.getElementById("status")!;
  el.textContent = message;
  el.className = "status success";
  el.style.display = "block";
}

function showRenderReady(hasAutoTiming: boolean): void {
  const renderSection = document.getElementById("render-section")!;
  renderSection.style.display = "block";

  const info = document.getElementById("frame-info")!;
  const timingBadge = hasAutoTiming ? "التوقيت من البروتوتايب" : "توقيت احتياطي";
  info.textContent = `${loadedImages.length} شاشات — ${canvasWidth}×${canvasHeight} @ ${exportScale}x — ${timingBadge}`;

  const progressArea = document.getElementById("progress-area")!;
  progressArea.style.display = "none";

  const status = document.getElementById("status")!;
  status.style.display = "none";
}

// --- Init ---

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("export-btn")!.addEventListener("click", () => {
    const scale = parseInt((document.getElementById("scale") as HTMLSelectElement).value);
    const fallbackHoldMs = parseInt((document.getElementById("hold-duration") as HTMLInputElement).value);
    parent.postMessage({ pluginMessage: { type: "start-export", scale, fallbackHoldMs } }, "*");
  });

  document.getElementById("preview-btn")!.addEventListener("click", () => runPreview());
  document.getElementById("stop-preview-btn")!.addEventListener("click", () => stopPreview());
  document.getElementById("render-btn")!.addEventListener("click", () => renderVideo());
  document.getElementById("cancel-render-btn")!.addEventListener("click", () => cancelRender());
  document.getElementById("cancel-btn")!.addEventListener("click", () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  });
});
