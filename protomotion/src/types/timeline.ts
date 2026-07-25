/**
 * Timeline data model — the core temporal representation.
 *
 * The timeline is the bridge between the prototype graph (spatial structure)
 * and the renderer (frame-by-frame output). The playback engine simulates
 * user interactions against the prototype graph and emits PlaybackEvents;
 * the timeline builder converts those events into a RenderTimeline made of
 * segments, each containing animation tracks with keyframes.
 *
 * Key design decisions:
 *
 * 1. **Segments, not frames** — the timeline is a sequence of segments
 *    (static holds + animated transitions), not a flat list of frames.
 *    This makes it resolution/FPS-independent; the renderer samples the
 *    timeline at whatever rate the export requires.
 *
 * 2. **Normalized time** — keyframe times within a track are 0–1, relative
 *    to the segment's duration. This keeps easing math clean and lets us
 *    change segment durations without touching keyframes.
 *
 * 3. **Per-property tracks** — each animated property on each node gets its
 *    own track. This mirrors how Smart Animate works: layer-matched nodes
 *    interpolate each property independently. It also makes the renderer's
 *    job trivial: sample every track at time t, compose, done.
 */

import type { Color, Vector2D } from './primitives';
import type { EasingDefinition, TransitionType } from './interactions';
import type { AnimatableStyle } from './prototype';

// ─── Animatable Properties ───────────────────────────────────────────────────

export type AnimatableProperty =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'opacity'
  | 'cornerRadiusTL'
  | 'cornerRadiusTR'
  | 'cornerRadiusBR'
  | 'cornerRadiusBL'
  | 'fillColor'
  | 'fillOpacity'
  | 'strokeColor'
  | 'strokeWeight'
  | 'strokeOpacity'
  | 'blurRadius'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'shadowBlurRadius'
  | 'shadowSpreadRadius'
  | 'shadowColor'
  | 'clipContent'
  | 'visible';

export type AnimatableValue = number | Color | boolean;

// ─── Keyframes ───────────────────────────────────────────────────────────────

export interface PropertyKeyframe {
  readonly time: number; // 0–1 within the segment
  readonly value: AnimatableValue;
}

export interface AnimationTrack {
  readonly nodeId: string;
  readonly property: AnimatableProperty;
  readonly keyframes: readonly PropertyKeyframe[];
  readonly easing: EasingDefinition;
}

// ─── Segments ────────────────────────────────────────────────────────────────

export type SegmentType =
  | 'STATIC'       // hold on a single frame state
  | 'TRANSITION'   // animated transition between states
  | 'OVERLAY_IN'   // overlay appearing
  | 'OVERLAY_OUT'  // overlay dismissing
  | 'SCROLL';      // animated scroll

export interface TimelineSegment {
  readonly id: string;
  readonly startTime: number;     // ms from timeline start
  readonly duration: number;      // ms
  readonly type: SegmentType;
  readonly transitionType?: TransitionType;
  readonly fromState: FrameState;
  readonly toState: FrameState;
  readonly tracks: readonly AnimationTrack[];
}

// ─── Frame State ─────────────────────────────────────────────────────────────
// A snapshot of the entire visible scene at a point in time.

export interface LayerState {
  readonly nodeId: string;
  readonly style: AnimatableStyle;
  readonly parentId: string | null;
  readonly childOrder: readonly string[];
  readonly isOverlay: boolean;
}

export interface FrameState {
  readonly activeFrameId: string;
  readonly layers: ReadonlyMap<string, LayerState>;
  readonly overlays: readonly OverlayState[];
  readonly scrollPositions: ReadonlyMap<string, Vector2D>;
  readonly variableValues: ReadonlyMap<string, AnimatableValue>;
  readonly cursorPosition?: Vector2D;
}

export interface OverlayState {
  readonly nodeId: string;
  readonly position: Vector2D;
  readonly dimBackground: boolean;
  readonly dimColor?: Color;
}

// ─── Render Timeline (root) ──────────────────────────────────────────────────

export interface RenderTimeline {
  readonly flowId: string;
  readonly flowName: string;
  readonly totalDuration: number; // ms
  readonly segments: readonly TimelineSegment[];
}

// ─── Playback Events ─────────────────────────────────────────────────────────
// Produced by the PlaybackEngine, consumed by the TimelineBuilder.

export type PlaybackEventType =
  | 'NAVIGATE'
  | 'BACK'
  | 'OVERLAY_OPEN'
  | 'OVERLAY_CLOSE'
  | 'OVERLAY_SWAP'
  | 'SCROLL'
  | 'COMPONENT_CHANGE'
  | 'VARIABLE_SET'
  | 'HOLD';

export interface PlaybackEvent {
  readonly type: PlaybackEventType;
  readonly time: number;                    // ms from playback start
  readonly sourceNodeId: string;
  readonly destinationNodeId?: string;
  readonly transition?: {
    readonly type: TransitionType;
    readonly duration: number;
    readonly easing: EasingDefinition;
    readonly direction?: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
  };
  readonly overlayState?: OverlayState;
  readonly scrollDelta?: Vector2D;
  readonly variableId?: string;
  readonly variableValue?: AnimatableValue;
  readonly holdDuration?: number;           // ms for HOLD events
}
