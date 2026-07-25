/**
 * Playback module — simulates prototype interaction flow.
 *
 * The playback engine takes a PrototypeGraph and walks through the
 * prototype as a user would: starting at the flow's initial frame,
 * triggering interactions in sequence, and recording every state
 * change as a PlaybackEvent.
 *
 * It does NOT render anything — it produces a time-ordered sequence of
 * events that the TimelineBuilder consumes to create animation tracks.
 *
 * Key responsibilities:
 * - Walk the prototype graph starting from a flow's entry point
 * - Determine trigger order (AFTER_DELAY triggers fire automatically;
 *   ON_CLICK triggers are simulated at configurable intervals)
 * - Track navigation stack for BACK actions
 * - Manage overlay stack
 * - Track variable state for conditional actions
 * - Detect and break cycles
 */

import type { PrototypeGraph } from '@/types/prototype';
import type { PlaybackEvent } from '@/types/timeline';
import type { PlaybackConfig } from '@/core/config';

export interface IPlaybackEngine {
  simulate(
    graph: PrototypeGraph,
    flowId: string,
    config: PlaybackConfig,
  ): Promise<PlaybackEvent[]>;
}

export type { IPlaybackEngine as default };
