/**
 * Message protocol between the plugin sandbox and the UI iframe.
 *
 * Figma plugins communicate between the main thread (sandbox, which has
 * access to the Figma API) and the UI thread (iframe) via postMessage.
 * This module defines a strictly typed, tagged-union protocol for that
 * communication channel.
 *
 * Each message type is a discriminated union variant keyed by `type`.
 * This gives us exhaustive checking in switch statements and makes it
 * impossible to send a malformed message.
 */

import type { PrototypeFlow, PrototypeGraph } from './prototype';
import type { RenderTimeline } from './timeline';
import type {
  ExportJob,
  ExportProgress,
  ExportSettings,
  BatchExportSettings,
} from './export';

// ─── Plugin → UI Messages ────────────────────────────────────────────────────

export type PluginMessage =
  | PluginReadyMessage
  | FlowsAvailableMessage
  | PrototypeParsedMessage
  | TimelineBuiltMessage
  | RenderProgressMessage
  | RenderCompleteMessage
  | ExportJobUpdateMessage
  | PluginErrorMessage;

export interface PluginReadyMessage {
  readonly type: 'PLUGIN_READY';
  readonly version: string;
}

export interface FlowsAvailableMessage {
  readonly type: 'FLOWS_AVAILABLE';
  readonly flows: readonly PrototypeFlow[];
  readonly documentName: string;
  readonly pageName: string;
}

export interface PrototypeParsedMessage {
  readonly type: 'PROTOTYPE_PARSED';
  readonly graph: PrototypeGraph;
  readonly nodeCount: number;
  readonly interactionCount: number;
}

export interface TimelineBuiltMessage {
  readonly type: 'TIMELINE_BUILT';
  readonly timeline: RenderTimeline;
  readonly segmentCount: number;
  readonly estimatedRenderTime: number; // ms
}

export interface RenderProgressMessage {
  readonly type: 'RENDER_PROGRESS';
  readonly progress: ExportProgress;
}

export interface RenderCompleteMessage {
  readonly type: 'RENDER_COMPLETE';
  readonly jobId: string;
  readonly outputPath: string;
  readonly outputSize: number;
  readonly duration: number;
}

export interface ExportJobUpdateMessage {
  readonly type: 'EXPORT_JOB_UPDATE';
  readonly job: ExportJob;
}

export interface PluginErrorMessage {
  readonly type: 'ERROR';
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}

// ─── UI → Plugin Messages ────────────────────────────────────────────────────

export type UIMessage =
  | ParsePrototypeMessage
  | SelectFlowMessage
  | StartExportMessage
  | CancelExportMessage
  | UpdateSettingsMessage
  | StartBatchExportMessage
  | RequestFlowsMessage;

export interface ParsePrototypeMessage {
  readonly type: 'PARSE_PROTOTYPE';
}

export interface SelectFlowMessage {
  readonly type: 'SELECT_FLOW';
  readonly flowId: string;
}

export interface StartExportMessage {
  readonly type: 'START_EXPORT';
  readonly flowId: string;
  readonly settings: ExportSettings;
}

export interface CancelExportMessage {
  readonly type: 'CANCEL_EXPORT';
  readonly jobId: string;
}

export interface UpdateSettingsMessage {
  readonly type: 'UPDATE_SETTINGS';
  readonly settings: Partial<ExportSettings>;
}

export interface StartBatchExportMessage {
  readonly type: 'START_BATCH_EXPORT';
  readonly batch: BatchExportSettings;
}

export interface RequestFlowsMessage {
  readonly type: 'REQUEST_FLOWS';
}

// ─── Plugin ↔ Desktop Helper Messages ────────────────────────────────────────
// Used when communicating with the Electron companion app.

export type DesktopMessage =
  | DesktopConnectMessage
  | DesktopEncodeMessage
  | DesktopProgressMessage
  | DesktopCompleteMessage
  | DesktopErrorMessage;

export interface DesktopConnectMessage {
  readonly type: 'DESKTOP_CONNECT';
  readonly version: string;
  readonly ffmpegVersion: string;
}

export interface DesktopEncodeMessage {
  readonly type: 'DESKTOP_ENCODE';
  readonly jobId: string;
  readonly settings: ExportSettings;
  readonly frameCount: number;
}

export interface DesktopProgressMessage {
  readonly type: 'DESKTOP_PROGRESS';
  readonly jobId: string;
  readonly progress: ExportProgress;
}

export interface DesktopCompleteMessage {
  readonly type: 'DESKTOP_COMPLETE';
  readonly jobId: string;
  readonly outputPath: string;
  readonly outputSize: number;
}

export interface DesktopErrorMessage {
  readonly type: 'DESKTOP_ERROR';
  readonly jobId: string;
  readonly code: string;
  readonly message: string;
}
