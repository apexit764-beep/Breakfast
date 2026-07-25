import { ArrayBufferTarget, Muxer } from "mp4-muxer";

export interface EncoderResult {
  blob: Blob;
  extension: string;
  /** Container actually used, which may differ from the requested one. */
  format: "mp4" | "webm";
  note: string | null;
}

export interface SinkOptions {
  /** Canvas the renderer draws into, at full export resolution. */
  source: HTMLCanvasElement;
  /** Requested output size; a sink may shrink it to something encodable. */
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export interface FrameSink {
  addFrame: () => Promise<void>;
  finish: () => Promise<EncoderResult>;
  abort: () => void;
  /** Size actually being encoded. */
  width: number;
  height: number;
}

/** H.264 wants even dimensions. */
export function evenDimension(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function isMp4Supported(): boolean {
  return (
    typeof (globalThis as any).VideoEncoder === "function" &&
    typeof (globalThis as any).VideoFrame === "function"
  );
}

export function isWebmSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    (MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ||
      MediaRecorder.isTypeSupported("video/webm;codecs=vp8"))
  );
}

// High → Main → Baseline, so the best available profile wins.
const H264_CODECS = [
  "avc1.640034",
  "avc1.640028",
  "avc1.4d0028",
  "avc1.42E01E",
];

// A 4x export easily exceeds every H.264 level, so try progressively smaller
// outputs. Rendering stays at full scale, which supersamples the result.
const SIZE_STEPS = [1, 0.75, 0.6, 0.5, 0.4, 0.3, 0.25];

interface Negotiated {
  codec: string;
  width: number;
  height: number;
}

async function negotiateH264(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<Negotiated | null> {
  const EncoderCtor = (globalThis as any).VideoEncoder;

  for (const factor of SIZE_STEPS) {
    const w = evenDimension(width * factor);
    const h = evenDimension(height * factor);
    if (w < 16 || h < 16) continue;

    for (const codec of H264_CODECS) {
      try {
        const support = await EncoderCtor.isConfigSupported({
          codec,
          width: w,
          height: h,
          bitrate,
          framerate: fps,
        });
        if (support && support.supported) return { codec, width: w, height: h };
      } catch {
        // Try the next candidate.
      }
    }
  }

  return null;
}

function scaledNote(
  requestedW: number,
  requestedH: number,
  actualW: number,
  actualH: number
): string | null {
  if (actualW === requestedW && actualH === requestedH) return null;
  return (
    `تم تصغير الفيديو إلى ${actualW}×${actualH} لأن ترميز MP4 ما بيدعم ` +
    `${requestedW}×${requestedH}. الرسم تم بالجودة الكاملة، فالنتيجة تبقى حادة.`
  );
}

/**
 * WebCodecs path: every frame carries an explicit timestamp, so playback speed
 * is exactly the intended one no matter how long rendering takes.
 */
async function createMp4Sink(options: SinkOptions): Promise<FrameSink | null> {
  const { source, width, height, fps, bitrate } = options;

  const negotiated = await negotiateH264(width, height, fps, bitrate);
  if (!negotiated) return null;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: negotiated.width, height: negotiated.height },
    fastStart: "in-memory",
  });

  const EncoderCtor = (globalThis as any).VideoEncoder;
  const VideoFrameCtor = (globalThis as any).VideoFrame;
  let encodeError: Error | null = null;

  const encoder = new EncoderCtor({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: Error) => {
      encodeError = e;
    },
  });

  encoder.configure({
    codec: negotiated.codec,
    width: negotiated.width,
    height: negotiated.height,
    bitrate,
    framerate: fps,
    latencyMode: "quality",
  });

  // Downscaling happens once per frame into this intermediate canvas.
  const needsResize =
    negotiated.width !== source.width || negotiated.height !== source.height;
  let scratch: HTMLCanvasElement | null = null;
  let scratchCtx: CanvasRenderingContext2D | null = null;
  if (needsResize) {
    scratch = document.createElement("canvas");
    scratch.width = negotiated.width;
    scratch.height = negotiated.height;
    scratchCtx = scratch.getContext("2d", { alpha: false });
    if (scratchCtx) {
      scratchCtx.imageSmoothingEnabled = true;
      scratchCtx.imageSmoothingQuality = "high";
    }
  }

  const microsPerFrame = 1_000_000 / fps;
  let frameIndex = 0;
  let aborted = false;

  return {
    width: negotiated.width,
    height: negotiated.height,

    async addFrame() {
      if (aborted) return;
      if (encodeError) throw encodeError;

      // Keep the encoder queue bounded so memory stays flat on long exports.
      while (encoder.encodeQueueSize > 30) {
        await new Promise((resolve) => setTimeout(resolve, 4));
        if (aborted) return;
      }

      let input: HTMLCanvasElement = source;
      if (scratch && scratchCtx) {
        scratchCtx.drawImage(source, 0, 0, scratch.width, scratch.height);
        input = scratch;
      }

      const frame = new VideoFrameCtor(input, {
        timestamp: Math.round(frameIndex * microsPerFrame),
        duration: Math.round(microsPerFrame),
      });

      // A keyframe every two seconds keeps seeking responsive.
      encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
      frame.close();
      frameIndex++;
    },

    async finish() {
      await encoder.flush();
      if (encodeError) throw encodeError;
      muxer.finalize();
      return {
        blob: new Blob([target.buffer], { type: "video/mp4" }),
        extension: "mp4",
        format: "mp4",
        note: scaledNote(width, height, negotiated.width, negotiated.height),
      };
    },

    abort() {
      aborted = true;
      try {
        encoder.close();
      } catch {
        // Already closed.
      }
    },
  };
}

/**
 * MediaRecorder path: frames are timestamped by wall clock, so a slow render
 * stretches the result. Used only when WebCodecs is unavailable.
 */
function createWebmSink(options: SinkOptions, fallbackNote: string | null): FrameSink {
  const { source, fps, bitrate } = options;

  const stream = source.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;

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

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  const frameInterval = 1000 / fps;

  // MediaRecorder timestamps by wall clock, so the gap between frames has to
  // absorb the caller's drawing time instead of being added on top of it —
  // sleeping a full interval per frame stretches the result by however long
  // rendering took.
  let deadline = performance.now();
  let lateFrames = 0;
  let frames = 0;

  return {
    width: source.width,
    height: source.height,

    async addFrame() {
      track.requestFrame();
      frames++;

      deadline += frameInterval;
      const wait = deadline - performance.now();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        return;
      }

      // Drawing outran the frame budget; the clock can't be rewound, so record
      // the slip and restart from now rather than accumulating debt.
      lateFrames++;
      deadline = performance.now();
    },

    async finish() {
      recorder.stop();
      await stopped;

      const notes: string[] = [];
      if (fallbackNote) notes.push(fallbackNote);
      if (lateFrames > frames * 0.2) {
        notes.push(
          "الرسم كان أبطأ من سرعة التشغيل المطلوبة، فطول الفيديو زاد شوي. " +
            "جرّب جودة أقل أو 30 إطار/ثانية."
        );
      }

      return {
        blob: new Blob(chunks, { type: "video/webm" }),
        extension: "webm",
        format: "webm",
        note: notes.length ? notes.join("\n") : null,
      };
    },

    abort() {
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}

const NO_ENCODER =
  "متصفحك ما بيدعم ترميز الفيديو.\n" +
  "استخدم تطبيق فيجما للديسكتوب أو متصفح Chrome.";

export async function createSink(
  format: "mp4" | "webm",
  options: SinkOptions
): Promise<FrameSink> {
  if (format === "mp4" && isMp4Supported()) {
    try {
      const sink = await createMp4Sink(options);
      if (sink) return sink;
      if (isWebmSupported()) {
        return createWebmSink(
          options,
          "تعذّر ترميز MP4 بهذه الأبعاد، فتم التصدير بصيغة WebM."
        );
      }
    } catch (e) {
      if (!isWebmSupported()) throw e;
      return createWebmSink(
        options,
        "فشل ترميز MP4، فتم التصدير بصيغة WebM."
      );
    }
  }

  if (isWebmSupported()) {
    const note =
      format === "mp4"
        ? "تم التصدير بصيغة WebM لأن متصفحك ما بيدعم ترميز MP4."
        : null;
    return createWebmSink(options, note);
  }

  if (format === "webm" && isMp4Supported()) {
    const sink = await createMp4Sink(options);
    if (sink) return sink;
  }

  throw new Error(NO_ENCODER);
}
