/**
 * Configuration management.
 *
 * Centralizes all configurable values with sensible defaults.
 * The UI builds an ExportSettings object; the config module merges
 * it with defaults and validates the result before the pipeline starts.
 */

import type { Color } from '@/types/primitives';
import type { ExportSettings } from '@/types/export';
import { CODEC_SUPPORT } from '@/types/export';
import type { CursorConfig, FPS, Resolution } from '@/types/rendering';

export interface ProtoMotionConfig {
  readonly export: ExportSettings;
  readonly playback: PlaybackConfig;
  readonly render: RenderPipelineConfig;
}

export interface PlaybackConfig {
  readonly defaultHoldDuration: number;  // ms to hold on each frame before the next trigger
  readonly autoAdvanceDelay: number;     // ms delay when auto-advancing through triggers
  readonly maxDepth: number;             // max navigation depth to prevent infinite loops
  readonly maxDuration: number;          // max total timeline duration in ms
}

export interface RenderPipelineConfig {
  readonly maxConcurrentFrames: number;  // frames to render in parallel
  readonly memoryLimitMB: number;        // soft memory limit for frame buffer
  readonly chunkSize: number;            // frames per encoding chunk
}

const DEFAULT_RESOLUTION: Resolution = {
  width: 1920,
  height: 1080,
  preset: '1080p',
  scale: 1,
};

const DEFAULT_BACKGROUND: Color = { r: 1, g: 1, b: 1, a: 1 };

const DEFAULT_CURSOR: CursorConfig = {
  visible: true,
  theme: 'macos',
  clickAnimation: true,
  clickAnimationDuration: 200,
  clickAnimationScale: 0.9,
  hotspot: { x: 0, y: 0 },
};

export const DEFAULT_FPS: FPS = 60;

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'mp4',
  resolution: DEFAULT_RESOLUTION,
  fps: DEFAULT_FPS,
  codec: 'h264',
  bitrate: 'auto',
  cursor: DEFAULT_CURSOR,
  transparentBackground: false,
  backgroundColor: DEFAULT_BACKGROUND,
  outputFileName: 'prototype-export',
};

export const DEFAULT_PLAYBACK_CONFIG: PlaybackConfig = {
  defaultHoldDuration: 1000,
  autoAdvanceDelay: 500,
  maxDepth: 100,
  maxDuration: 300_000, // 5 minutes
};

export const DEFAULT_RENDER_PIPELINE_CONFIG: RenderPipelineConfig = {
  maxConcurrentFrames: 4,
  memoryLimitMB: 512,
  chunkSize: 60,
};

export function createConfig(overrides?: Partial<ProtoMotionConfig>): ProtoMotionConfig {
  return {
    export: overrides?.export ?? DEFAULT_EXPORT_SETTINGS,
    playback: { ...DEFAULT_PLAYBACK_CONFIG, ...overrides?.playback },
    render: { ...DEFAULT_RENDER_PIPELINE_CONFIG, ...overrides?.render },
  };
}

export function validateExportSettings(settings: ExportSettings): string[] {
  const errors: string[] = [];

  if (settings.resolution.width < 1 || settings.resolution.height < 1) {
    errors.push('Resolution must be at least 1x1');
  }
  if (settings.resolution.width > 7680 || settings.resolution.height > 4320) {
    errors.push('Resolution cannot exceed 8K (7680x4320)');
  }

  const validFps: FPS[] = [24, 30, 60, 120];
  if (!validFps.includes(settings.fps)) {
    errors.push(`Invalid FPS: ${settings.fps}. Must be one of: ${validFps.join(', ')}`);
  }

  const supportedCodecs = CODEC_SUPPORT[settings.format];
  if (supportedCodecs.length > 0 && !supportedCodecs.includes(settings.codec)) {
    errors.push(`Codec ${settings.codec} is not supported for format ${settings.format}`);
  }

  return errors;
}
