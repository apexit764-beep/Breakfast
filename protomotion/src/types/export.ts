/**
 * Export types — video encoding and file output.
 *
 * The export module sits at the end of the pipeline: it takes rendered
 * frames from the renderer and encodes them into the target video format
 * using FFmpeg (via the desktop helper app).
 *
 * Architecture note: The Figma plugin itself cannot run FFmpeg. The export
 * module serializes the render timeline + rendered frames and sends them
 * to the Electron companion app, which runs FFmpeg as a child process.
 * These types define the contract between the two.
 */

import type { Color, Size } from './primitives';
import type { FPS, Resolution, CursorConfig, WatermarkSettings } from './rendering';

// ─── Format & Codec ──────────────────────────────────────────────────────────

export type ExportFormat = 'mp4' | 'mov' | 'webm' | 'gif' | 'png-sequence' | 'jpeg-sequence';

export type VideoCodec = 'h264' | 'h265' | 'av1' | 'prores';

export type BitratePreset = 'auto' | '5mbps' | '10mbps' | '20mbps' | 'lossless';

export const BITRATE_VALUES: Record<BitratePreset, number | null> = {
  'auto': null,
  '5mbps': 5_000_000,
  '10mbps': 10_000_000,
  '20mbps': 20_000_000,
  'lossless': 0, // signals lossless mode to FFmpeg
};

export const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  'mp4': '.mp4',
  'mov': '.mov',
  'webm': '.webm',
  'gif': '.gif',
  'png-sequence': '',
  'jpeg-sequence': '',
};

export const CODEC_SUPPORT: Record<ExportFormat, readonly VideoCodec[]> = {
  'mp4': ['h264', 'h265', 'av1'],
  'mov': ['h264', 'h265', 'prores'],
  'webm': ['av1'],
  'gif': [],
  'png-sequence': [],
  'jpeg-sequence': [],
};

// ─── Export Settings ─────────────────────────────────────────────────────────

export interface ExportSettings {
  readonly format: ExportFormat;
  readonly resolution: Resolution;
  readonly fps: FPS;
  readonly codec: VideoCodec;
  readonly bitrate: BitratePreset;
  readonly cursor: CursorConfig;
  readonly transparentBackground: boolean;
  readonly backgroundColor: Color;
  readonly watermark?: WatermarkSettings;
  readonly audioPath?: string;
  readonly outputFileName: string;
}

// ─── Export Job ───────────────────────────────────────────────────────────────

export type ExportJobStatus =
  | 'QUEUED'
  | 'PARSING'
  | 'BUILDING_TIMELINE'
  | 'RENDERING'
  | 'ENCODING'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED';

export interface ExportJob {
  readonly id: string;
  readonly flowId: string;
  readonly flowName: string;
  readonly settings: ExportSettings;
  readonly status: ExportJobStatus;
  readonly progress: ExportProgress;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly error?: ExportError;
  readonly outputPath?: string;
  readonly outputSize?: number; // bytes
}

export interface ExportProgress {
  readonly phase: ExportJobStatus;
  readonly currentFrame: number;
  readonly totalFrames: number;
  readonly percent: number;          // 0–100
  readonly estimatedTimeRemaining: number; // ms
  readonly elapsedTime: number;      // ms
  readonly framesPerSecond: number;  // rendering speed
}

export interface ExportError {
  readonly code: ExportErrorCode;
  readonly message: string;
  readonly details?: string;
}

export type ExportErrorCode =
  | 'FFMPEG_NOT_FOUND'
  | 'FFMPEG_CRASH'
  | 'CODEC_UNSUPPORTED'
  | 'OUT_OF_MEMORY'
  | 'DISK_FULL'
  | 'INVALID_SETTINGS'
  | 'RENDER_FAILED'
  | 'CANCELLED'
  | 'DESKTOP_APP_NOT_CONNECTED'
  | 'UNKNOWN';

// ─── Batch Export ────────────────────────────────────────────────────────────

export interface BatchExportSettings {
  readonly flowIds: readonly string[];
  readonly settings: ExportSettings;
  readonly namingPattern: string; // e.g. "{flow}-{resolution}"
  readonly outputDirectory: string;
}

export interface BatchExportProgress {
  readonly totalJobs: number;
  readonly completedJobs: number;
  readonly currentJobId: string;
  readonly currentJobProgress: ExportProgress;
  readonly overallPercent: number;
}

// ─── FFmpeg Bridge ───────────────────────────────────────────────────────────
// Contract between the plugin and the Electron desktop helper.

export interface FFmpegCommand {
  readonly inputFramePattern: string;
  readonly outputPath: string;
  readonly fps: FPS;
  readonly resolution: Size;
  readonly codec: VideoCodec;
  readonly bitrate: number | null;
  readonly pixelFormat: string;
  readonly audioPath?: string;
  readonly extraArgs?: readonly string[];
}

export interface FFmpegProgress {
  readonly frame: number;
  readonly fps: number;
  readonly bitrate: string;
  readonly totalSize: number;
  readonly outTimeMs: number;
  readonly speed: string;
}
