/**
 * Export module — encodes rendered frames into video.
 *
 * The exporter takes rendered frames and encodes them into the target
 * format using FFmpeg. Since FFmpeg cannot run inside the Figma plugin
 * sandbox, this module communicates with the Electron desktop helper.
 *
 * Contains:
 * - Encoder:           Orchestrates the encoding pipeline
 * - FormatHandler:     Format-specific FFmpeg argument generation
 * - FFmpegBridge:      Communication with the desktop helper
 * - BatchExporter:     Multi-flow batch export management
 */

import type { PrototypeGraph } from '@/types/prototype';
import type { RenderTimeline } from '@/types/timeline';
import type { ExportSettings } from '@/types/export';
import type { IFrameRenderer } from '@/renderer';

export interface ExportCallbacks {
  readonly signal: AbortSignal;
  readonly onFrame: (frameIndex: number) => void;
}

export interface IExporter {
  encode(
    timeline: RenderTimeline,
    graph: PrototypeGraph,
    settings: ExportSettings,
    renderer: IFrameRenderer,
    callbacks: ExportCallbacks,
  ): Promise<string>; // returns output path
}

export type { IExporter as default };
