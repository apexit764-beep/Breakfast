/**
 * Renderer module — generates individual frames from the timeline.
 *
 * Given a point in time on the RenderTimeline, the renderer:
 * 1. Finds the active segment
 * 2. Samples all AnimationTracks at the local time
 * 3. Interpolates property values using the segment's easing
 * 4. Composites layers in z-order
 * 5. Applies cursor overlay if configured
 * 6. Outputs a RenderedFrame (raw RGBA pixel buffer)
 *
 * Contains:
 * - FrameRenderer:     Top-level render-at-time function
 * - LayerCompositor:   Z-order compositing with blend modes and masks
 * - Interpolator:      Generic property value interpolation
 * - SmartAnimate:      Smart Animate layer matching and interpolation
 * - CursorRenderer:    Cursor overlay with click animations
 */

import type { PrototypeGraph } from '@/types/prototype';
import type { RenderTimeline } from '@/types/timeline';
import type { RenderedFrame, RenderConfig } from '@/types/rendering';

export interface IFrameRenderer {
  initialize(
    timeline: RenderTimeline,
    graph: PrototypeGraph,
    config: RenderConfig,
  ): Promise<void>;

  renderFrame(timeMs: number): Promise<RenderedFrame>;

  dispose(): void;
}

export type { IFrameRenderer as default };
