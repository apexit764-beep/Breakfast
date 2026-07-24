import { ArrayBufferTarget, Muxer } from "mp4-muxer";

export interface EncoderResult {
  blob: Blob;
  extension: string;
  /** Actual container used, which may differ from the requested one. */
  format: "mp4" | "webm";
  note: string | null;
}

export interface VideoEncoderOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export interface FrameSink {
  addFrame: () => Promise<void>;
  finish: () => Promise<EncoderResult>;
  abort: () => void;
}

export function isMp4Supported(): boolean {
  return typeof (globalThis as any).VideoEncoder === "function";
}

export function isWebmSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    (MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ||
      MediaRecorder.isTypeSupported("video/webm;codecs=vp8"))
  );
}

/**
 * H.264 needs even dimensions, and levels below 5.2 cap out well under what a
 * 4x export can reach. Callers should clamp before creating the encoder.
 */
export function evenDimension(value: number): number {
  return value % 2 === 0 ? value : value - 1;
}

/**
 * WebCodecs path: every frame carries an explicit timestamp, so playback speed
 * is exactly the intended one no matter how long rendering takes.
 */
async function createMp4Sink(options: VideoEncoderOptions): Promise<FrameSink> {
  const { canvas, width, height, fps, bitrate } = options;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height },
    fastStart: "in-memory",
  });

  const EncoderCtor = (globalThis as any).VideoEncoder;
  let encodeError: Error | null = null;

  const encoder = new EncoderCtor({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: Error) => {
      encodeError = e;
    },
  });

  encoder.configure({
    codec: "avc1.640034", // High profile, level 5.2
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: "quality",
  });

  const microsPerFrame = 1_000_000 / fps;
  let frameIndex = 0;
  let aborted = false;

  return {
    async addFrame() {
      if (aborted) return;
      if (encodeError) throw encodeError;

      // Keep the encoder queue bounded so memory stays flat on long exports.
      while (encoder.encodeQueueSize > 30) {
        await new Promise((resolve) => setTimeout(resolve, 4));
        if (aborted) return;
      }

      const VideoFrameCtor = (globalThis as any).VideoFrame;
      const frame = new VideoFrameCtor(canvas, {
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
        note: null,
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
async function createWebmSink(options: VideoEncoderOptions): Promise<FrameSink> {
  const { canvas, fps, bitrate } = options;

  const stream = canvas.captureStream(0);
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

  return {
    async addFrame() {
      track.requestFrame();
      await new Promise((resolve) => setTimeout(resolve, frameInterval));
    },

    async finish() {
      recorder.stop();
      await stopped;
      return {
        blob: new Blob(chunks, { type: "video/webm" }),
        extension: "webm",
        format: "webm",
        note: "تم التصدير بصيغة WebM لأن متصفحك ما بيدعم ترميز MP4.",
      };
    },

    abort() {
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}

export async function createSink(
  format: "mp4" | "webm",
  options: VideoEncoderOptions
): Promise<FrameSink> {
  if (format === "mp4") {
    if (!isMp4Supported()) {
      if (!isWebmSupported()) {
        throw new Error(
          "متصفحك ما بيدعم ترميز الفيديو (WebCodecs ولا MediaRecorder).\n" +
            "استخدم تطبيق فيجما للديسكتوب أو متصفح Chrome."
        );
      }
      return createWebmSink(options);
    }

    try {
      return await createMp4Sink(options);
    } catch (e) {
      if (!isWebmSupported()) throw e;
      return createWebmSink(options);
    }
  }

  if (!isWebmSupported()) {
    if (isMp4Supported()) return createMp4Sink(options);
    throw new Error(
      "متصفحك ما بيدعم ترميز الفيديو.\n" +
        "استخدم تطبيق فيجما للديسكتوب أو متصفح Chrome."
    );
  }
  return createWebmSink(options);
}
