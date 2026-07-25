/**
 * Timeline module — builds the render timeline from playback events.
 *
 * Converts the time-ordered PlaybackEvent sequence into a RenderTimeline:
 * a series of TimelineSegments, each containing AnimationTracks with
 * PropertyKeyframes.
 *
 * The timeline is the central data structure for rendering. It is:
 * - Resolution-independent (keyframes use normalized 0–1 time)
 * - FPS-independent (the renderer samples at any rate)
 * - Fully deterministic (same input → same output)
 *
 * Contains:
 * - TimelineBuilder:    Orchestrates segment creation from events
 * - SegmentBuilder:     Creates individual segments with proper timing
 * - KeyframeGenerator:  Generates property keyframes for transitions
 * - Easing:             Mathematical easing function implementations
 */

import type { PrototypeGraph } from '@/types/prototype';
import type { RenderTimeline, PlaybackEvent } from '@/types/timeline';
import type { Resolution, FPS } from '@/types/rendering';

export interface TimelineBuildOptions {
  readonly fps: FPS;
  readonly resolution: Resolution;
}

export interface ITimelineBuilder {
  build(
    graph: PrototypeGraph,
    events: PlaybackEvent[],
    options: TimelineBuildOptions,
  ): RenderTimeline;
}

export type { ITimelineBuilder as default };
