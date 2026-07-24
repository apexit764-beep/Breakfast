// Shared between the plugin sandbox (code.ts) and the UI iframe (ui.ts).

export interface BezierParams {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SpringParams {
  mass: number;
  stiffness: number;
  damping: number;
  initialVelocity: number;
}

export interface EasingSpec {
  type: string;
  bezier?: BezierParams;
  spring?: SpringParams;
}

/** Mirrors Figma's Transition, flattened for transport. */
export interface TransitionSpec {
  type: string; // DISSOLVE | SMART_ANIMATE | SCROLL_ANIMATE | MOVE_IN | MOVE_OUT | PUSH | SLIDE_IN | SLIDE_OUT
  direction: string; // LEFT | RIGHT | TOP | BOTTOM
  matchLayers: boolean;
  duration: number; // seconds
  easing: EasingSpec;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A direct child of a frame, used to drive smart-animate interpolation. */
export interface LayerSpec {
  key: string; // match key (layer name)
  rect: Rect; // relative to the frame's bounding box, in frame units
  opacity: number;
  imageIndex: number; // index into the frame's layerImages array
}

export interface FrameSpec {
  id: string;
  name: string;
  width: number;
  height: number;
  holdDuration: number; // ms
  transition: TransitionSpec | null; // transition OUT of this frame
  navigation: string; // NAVIGATE | SWAP | OVERLAY | SCROLL_TO | CHANGE_TO
  /** Set when this frame's outgoing transition needs per-layer animation. */
  layers: LayerSpec[] | null;
  /** True when the frame image excludes its direct children (background only). */
  hasBaseImage: boolean;
  /** This frame is an overlay drawn on top of the previous one. */
  isOverlay: boolean;
  /** Overlay offset relative to the frame below, in frame units. */
  overlayPosition: { x: number; y: number } | null;
}

export interface ExportStartMsg {
  type: "export-start";
  totalFrames: number;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  /** Index the flow returns to after the last frame, or null if it ends. */
  loopToIndex: number | null;
}

export interface FrameDataMsg {
  type: "frame-data";
  index: number;
  total: number;
  frame: FrameSpec;
  /** Full-frame render, or background-only when frame.hasBaseImage is true. */
  imageBytes: Uint8Array;
  /** Individual renders for frame.layers, same order. */
  layerImages: Uint8Array[];
}

export interface ExportCompleteMsg {
  type: "export-complete";
  hasAutoTiming: boolean;
  warnings: string[];
}

export interface PluginSettings {
  scale: number;
  fallbackHoldMs: number;
  fps: number;
  bitrate: number;
  format: "mp4" | "webm";
  source: "auto" | "frames" | "variants";
}

export const DEFAULT_SETTINGS: PluginSettings = {
  scale: 4,
  fallbackHoldMs: 1000,
  fps: 60,
  bitrate: 20_000_000,
  format: "mp4",
  source: "auto",
};

/**
 * Figma exposes spring presets by name only. These parameters approximate
 * Figma's built-in curves; CUSTOM_SPRING carries its own exact values.
 */
export const SPRING_PRESETS: Record<string, SpringParams> = {
  GENTLE: { mass: 1, stiffness: 100, damping: 15, initialVelocity: 0 },
  QUICK: { mass: 1, stiffness: 300, damping: 20, initialVelocity: 0 },
  BOUNCY: { mass: 1, stiffness: 600, damping: 15, initialVelocity: 0 },
  SLOW: { mass: 1, stiffness: 80, damping: 20, initialVelocity: 0 },
};

export const MAX_ANIMATED_LAYERS = 40;
