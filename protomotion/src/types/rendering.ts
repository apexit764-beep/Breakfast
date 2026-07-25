/**
 * Rendering types — frame generation and compositing.
 *
 * The renderer's job is to take a point in time on the RenderTimeline and
 * produce a single raster frame (as pixel data). It does this by:
 *
 * 1. Finding the active segment at that time.
 * 2. Sampling every AnimationTrack at the local time within the segment.
 * 3. Compositing layers in z-order, applying interpolated styles.
 * 4. Optionally overlaying a cursor.
 *
 * These types define the renderer's inputs, outputs, and configuration.
 */

import type { Bounds, Color, Size, Vector2D } from './primitives';

// ─── Render Configuration ────────────────────────────────────────────────────

export type ResolutionPreset = '720p' | '1080p' | '1440p' | '4k' | '8k' | 'custom';

export interface Resolution {
  readonly width: number;
  readonly height: number;
  readonly preset: ResolutionPreset;
  readonly scale: number; // multiplier relative to prototype's native size
}

export const RESOLUTION_PRESETS: Record<ResolutionPreset, { width: number; height: number } | null> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
  '8k': { width: 7680, height: 4320 },
  'custom': null,
};

export type FPS = 24 | 30 | 60 | 120;

export interface RenderConfig {
  readonly resolution: Resolution;
  readonly fps: FPS;
  readonly backgroundColor: Color;
  readonly transparentBackground: boolean;
  readonly antialiasing: boolean;
}

// ─── Cursor ──────────────────────────────────────────────────────────────────

export type CursorTheme = 'macos' | 'windows' | 'custom';

export interface CursorConfig {
  readonly visible: boolean;
  readonly theme: CursorTheme;
  readonly customImageData?: Uint8Array;
  readonly clickAnimation: boolean;
  readonly clickAnimationDuration: number; // ms
  readonly clickAnimationScale: number;
  readonly hotspot: Vector2D;
}

// ─── Rendered Frame ──────────────────────────────────────────────────────────

export interface RenderedFrame {
  readonly index: number;
  readonly time: number;    // ms from timeline start
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array; // raw RGBA pixel data
}

// ─── Render Layer (intermediate compositing unit) ────────────────────────────

export interface RenderLayer {
  readonly nodeId: string;
  readonly bounds: Bounds;
  readonly opacity: number;
  readonly rotation: number;
  readonly clipBounds?: Bounds;
  readonly blendMode: string;
  readonly visible: boolean;
  readonly imageData?: Uint8Array;
  readonly children: readonly RenderLayer[];
  readonly isOverlay: boolean;
  readonly isMask: boolean;
}

// ─── Interpolation ───────────────────────────────────────────────────────────

export type InterpolationStrategy = 'NUMERIC' | 'COLOR' | 'BOOLEAN' | 'VECTOR';

export interface InterpolationResult {
  readonly value: number | Color | boolean;
  readonly strategy: InterpolationStrategy;
}

// ─── Smart Animate Layer Matching ────────────────────────────────────────────

export interface LayerMatch {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly matchType: 'NAME' | 'ID' | 'POSITION';
  readonly confidence: number; // 0–1
}

export interface SmartAnimateMapping {
  readonly matches: readonly LayerMatch[];
  readonly unmatchedSource: readonly string[]; // fade out
  readonly unmatchedTarget: readonly string[]; // fade in
}

// ─── Watermark ───────────────────────────────────────────────────────────────

export type WatermarkPosition =
  | 'TOP_LEFT'
  | 'TOP_RIGHT'
  | 'BOTTOM_LEFT'
  | 'BOTTOM_RIGHT'
  | 'CENTER';

export interface WatermarkSettings {
  readonly imageData: Uint8Array;
  readonly position: WatermarkPosition;
  readonly size: Size;
  readonly opacity: number;
  readonly margin: number;
}
