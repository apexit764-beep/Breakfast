/**
 * UI state types for the plugin's interface.
 *
 * The UI is a plain HTML/CSS/TypeScript iframe — no framework.
 * State is managed via a simple reactive store pattern.
 */

import type { ExportJob, ExportSettings } from './export';
import type { PrototypeFlow } from './prototype';
import type { RenderTimeline } from './timeline';

// ─── View State ──────────────────────────────────────────────────────────────

export type UIView =
  | 'LOADING'
  | 'FLOW_SELECT'
  | 'SETTINGS'
  | 'EXPORTING'
  | 'COMPLETE'
  | 'QUEUE'
  | 'HISTORY'
  | 'ERROR';

export interface UIState {
  readonly view: UIView;
  readonly isPluginReady: boolean;
  readonly isDesktopConnected: boolean;
  readonly flows: readonly PrototypeFlow[];
  readonly selectedFlowId: string | null;
  readonly exportSettings: ExportSettings;
  readonly timeline: RenderTimeline | null;
  readonly activeJobs: readonly ExportJob[];
  readonly completedJobs: readonly ExportJob[];
  readonly error: UIError | null;
}

export interface UIError {
  readonly title: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly action?: {
    readonly label: string;
    readonly handler: () => void;
  };
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface ExportHistoryEntry {
  readonly jobId: string;
  readonly flowName: string;
  readonly format: string;
  readonly resolution: string;
  readonly timestamp: number;
  readonly duration: number;   // render time in ms
  readonly fileSize: number;   // bytes
  readonly outputPath: string;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export type UIStateListener = (state: UIState) => void;

export interface UIStore {
  getState(): UIState;
  subscribe(listener: UIStateListener): () => void;
  dispatch(action: UIAction): void;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type UIAction =
  | { readonly type: 'SET_VIEW'; readonly view: UIView }
  | { readonly type: 'SET_FLOWS'; readonly flows: readonly PrototypeFlow[] }
  | { readonly type: 'SELECT_FLOW'; readonly flowId: string }
  | { readonly type: 'SET_SETTINGS'; readonly settings: Partial<ExportSettings> }
  | { readonly type: 'SET_TIMELINE'; readonly timeline: RenderTimeline }
  | { readonly type: 'ADD_JOB'; readonly job: ExportJob }
  | { readonly type: 'UPDATE_JOB'; readonly job: ExportJob }
  | { readonly type: 'REMOVE_JOB'; readonly jobId: string }
  | { readonly type: 'SET_ERROR'; readonly error: UIError | null }
  | { readonly type: 'SET_DESKTOP_CONNECTED'; readonly connected: boolean }
  | { readonly type: 'SET_PLUGIN_READY'; readonly ready: boolean };
