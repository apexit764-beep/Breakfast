interface FrameData {
  id: string;
  name: string;
  width: number;
  height: number;
  imageData: number[];
  transition: {
    type: string;
    direction: string;
    duration: number;
    easing: string;
  } | null;
  holdDuration: number;
}

interface FramesReadyMsg {
  type: "frames-ready";
  frames: FrameData[];
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  hasAutoTiming: boolean;
}

const FPS = 60;
const FRAME_INTERVAL = 1000 / FPS;

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
let framesData: FrameData[] = [];
let canvasWidth = 0;
let canvasHeight = 0;
let exportScale = 4;

window.onmessage = async (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === "progress") {
    updateProgress(msg.message, msg.current, msg.total);
  }

  if (msg.type === "error") {
    showError(msg.message);
  }

  if (msg.type === "frames-ready") {
    const data = msg as FramesReadyMsg;
    canvasWidth = data.canvasWidth;
    canvasHeight = data.canvasHeight;
    exportScale = data.scale;
    framesData = data.frames;
    await loadImages(data.frames);
    showRenderReady(data.hasAutoTiming);
  }
};

async function loadImages(frames: FrameData[]): Promise<void> {
  loadedImages = [];
  for (const frame of frames) {
    const blob = new Blob([new Uint8Array(frame.imageData)], {
      type: "image/png",
    });
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    loadedImages.push(img);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renderVideo(): Promise<void> {
  if (loadedImages.length === 0) return;

  const renderBtn = document.getElementById("render-btn") as HTMLButtonElement;
  renderBtn.disabled = true;
  renderBtn.textContent = "جاري إنشاء الفيديو...";

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
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
  });

  recorder.start();

  for (let i = 0; i < loadedImages.length; i++) {
    const frame = framesData[i];
    const img = loadedImages[i];

    // Draw the current frame
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Hold: emit frames for the hold duration
    const holdFrameCount = Math.round((frame.holdDuration / 1000) * FPS);
    for (let f = 0; f < holdFrameCount; f++) {
      if (track.requestFrame) track.requestFrame();
      await sleep(FRAME_INTERVAL);
    }

    // Transition to next frame
    if (i < loadedImages.length - 1) {
      const nextImg = loadedImages[i + 1];
      const trans = frame.transition;

      if (trans && trans.duration > 0) {
        const totalTransFrames = Math.max(
          Math.round(trans.duration * FPS),
          1
        );
        const easingFn = getEasing(trans.easing);

        for (let f = 0; f <= totalTransFrames; f++) {
          const rawT = f / totalTransFrames;
          const t = easingFn(rawT);

          ctx.clearRect(0, 0, w, h);
          drawTransition(ctx, img, nextImg, trans.type, trans.direction, t, w, h);

          if (track.requestFrame) track.requestFrame();
          await sleep(FRAME_INTERVAL);
        }
      }
    }

    updateProgress(
      `جاري إنشاء الفيديو: ${i + 1}/${loadedImages.length}`,
      i + 1,
      loadedImages.length
    );
  }

  recorder.stop();
  const videoBlob = await videoReady;

  const url = URL.createObjectURL(videoBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "prototype-export.webm";
  a.click();
  URL.revokeObjectURL(url);

  const sizeMB = (videoBlob.size / (1024 * 1024)).toFixed(1);

  renderBtn.disabled = false;
  renderBtn.textContent = "تصدير فيديو";

  showSuccess(`تم تصدير الفيديو بنجاح (${sizeMB} MB)`);
}

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
      drawSlideOut(ctx, fromImg, direction, t, w, h);
      ctx.drawImage(toImg, 0, 0, w, h);
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
      drawSlideOut(ctx, fromImg, direction, 1 - t, w, h);
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
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dir: string,
  t: number,
  w: number,
  h: number
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
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dir: string,
  t: number,
  w: number,
  h: number
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
  ctx: CanvasRenderingContext2D,
  fromImg: HTMLImageElement,
  toImg: HTMLImageElement,
  dir: string,
  t: number,
  w: number,
  h: number
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
  const el = document.getElementById("render-section")!;
  el.style.display = "block";
  const info = document.getElementById("frame-info")!;

  let timingNote = "";
  if (hasAutoTiming) {
    timingNote = " — التوقيت من إعدادات البروتوتايب ✓";
  } else {
    timingNote = " — يستخدم المدة الاحتياطية";
  }

  info.textContent = `${loadedImages.length} شاشات — ${canvasWidth}×${canvasHeight} @ ${exportScale}x${timingNote}`;

  const progressArea = document.getElementById("progress-area")!;
  progressArea.style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const exportBtn = document.getElementById("export-btn")!;
  exportBtn.addEventListener("click", () => {
    const scaleSelect = document.getElementById("scale") as HTMLSelectElement;
    const holdInput = document.getElementById("hold-duration") as HTMLInputElement;
    const scale = parseInt(scaleSelect.value);
    const fallbackHoldMs = parseInt(holdInput.value);

    parent.postMessage(
      { pluginMessage: { type: "start-export", scale, fallbackHoldMs } },
      "*"
    );
  });

  const renderBtn = document.getElementById("render-btn")!;
  renderBtn.addEventListener("click", () => {
    renderVideo();
  });

  const cancelBtn = document.getElementById("cancel-btn")!;
  cancelBtn.addEventListener("click", () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  });
});
