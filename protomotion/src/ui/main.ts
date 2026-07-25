/**
 * UI entry point.
 *
 * Runs in the plugin's iframe. Communicates with the plugin sandbox
 * via parent.postMessage / window.onmessage.
 *
 * No framework — plain TypeScript with a lightweight reactive store.
 */

import type { PluginMessage, UIMessage } from '@/types/messages';
import type { UIState, UIAction } from '@/types/ui';
import type { ExportSettings } from '@/types/export';
import { DEFAULT_EXPORT_SETTINGS } from '@/core/config';

function sendToPlugin(message: UIMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

function createInitialState(): UIState {
  return {
    view: 'LOADING',
    isPluginReady: false,
    isDesktopConnected: false,
    flows: [],
    selectedFlowId: null,
    exportSettings: DEFAULT_EXPORT_SETTINGS,
    timeline: null,
    activeJobs: [],
    completedJobs: [],
    error: null,
  };
}

type Listener = (state: UIState) => void;

function createStore() {
  let state = createInitialState();
  const listeners = new Set<Listener>();

  function getState(): UIState {
    return state;
  }

  function dispatch(action: UIAction): void {
    state = reduce(state, action);
    for (const listener of listeners) {
      listener(state);
    }
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, dispatch, subscribe };
}

function reduce(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.view };
    case 'SET_FLOWS':
      return { ...state, flows: action.flows };
    case 'SELECT_FLOW':
      return { ...state, selectedFlowId: action.flowId };
    case 'SET_SETTINGS':
      return {
        ...state,
        exportSettings: { ...state.exportSettings, ...action.settings } as ExportSettings,
      };
    case 'SET_TIMELINE':
      return { ...state, timeline: action.timeline };
    case 'ADD_JOB':
      return { ...state, activeJobs: [...state.activeJobs, action.job] };
    case 'UPDATE_JOB':
      return {
        ...state,
        activeJobs: state.activeJobs.map((j) =>
          j.id === action.job.id ? action.job : j,
        ),
      };
    case 'REMOVE_JOB': {
      const job = state.activeJobs.find((j) => j.id === action.jobId);
      return {
        ...state,
        activeJobs: state.activeJobs.filter((j) => j.id !== action.jobId),
        completedJobs: job ? [...state.completedJobs, job] : state.completedJobs,
      };
    }
    case 'SET_ERROR':
      return { ...state, error: action.error, view: action.error ? 'ERROR' : state.view };
    case 'SET_DESKTOP_CONNECTED':
      return { ...state, isDesktopConnected: action.connected };
    case 'SET_PLUGIN_READY':
      return { ...state, isPluginReady: action.ready };
  }
}

const store = createStore();

function handlePluginMessage(message: PluginMessage): void {
  switch (message.type) {
    case 'PLUGIN_READY':
      store.dispatch({ type: 'SET_PLUGIN_READY', ready: true });
      store.dispatch({ type: 'SET_VIEW', view: 'FLOW_SELECT' });
      sendToPlugin({ type: 'REQUEST_FLOWS' });
      break;

    case 'FLOWS_AVAILABLE':
      store.dispatch({ type: 'SET_FLOWS', flows: message.flows });
      if (message.flows.length > 0) {
        store.dispatch({ type: 'SET_VIEW', view: 'FLOW_SELECT' });
      }
      break;

    case 'PROTOTYPE_PARSED':
      store.dispatch({ type: 'SET_VIEW', view: 'SETTINGS' });
      break;

    case 'TIMELINE_BUILT':
      store.dispatch({ type: 'SET_TIMELINE', timeline: message.timeline });
      break;

    case 'RENDER_PROGRESS':
      break;

    case 'RENDER_COMPLETE':
      store.dispatch({ type: 'SET_VIEW', view: 'COMPLETE' });
      break;

    case 'EXPORT_JOB_UPDATE':
      store.dispatch({ type: 'UPDATE_JOB', job: message.job });
      break;

    case 'ERROR':
      store.dispatch({
        type: 'SET_ERROR',
        error: {
          title: 'Error',
          message: message.message,
          recoverable: message.recoverable,
        },
      });
      break;
  }
}

function render(state: UIState): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = renderView(state);
  attachEventListeners(state);
}

function renderView(state: UIState): string {
  switch (state.view) {
    case 'LOADING':
      return `
        <div class="view loading-view">
          <div class="spinner"></div>
          <p class="text-secondary">Connecting to Figma...</p>
        </div>`;

    case 'FLOW_SELECT':
      return `
        <div class="view flow-select-view">
          <header class="view-header">
            <h1 class="view-title">ProtoMotion</h1>
            <p class="text-secondary">Select a prototype flow to export</p>
          </header>
          <div class="flow-list">
            ${state.flows.length === 0
              ? '<p class="text-secondary text-center">No flows found. Add a flow starting point in your prototype.</p>'
              : state.flows
                  .map(
                    (flow) => `
                  <button class="flow-item ${state.selectedFlowId === flow.id ? 'selected' : ''}"
                          data-flow-id="${flow.id}">
                    <span class="flow-name">${flow.name}</span>
                  </button>`,
                  )
                  .join('')
            }
          </div>
          ${state.selectedFlowId
            ? '<button class="btn btn-primary btn-full" id="btn-continue">Continue</button>'
            : ''
          }
        </div>`;

    case 'SETTINGS':
      return `
        <div class="view settings-view">
          <header class="view-header">
            <h1 class="view-title">Export Settings</h1>
          </header>
          <div class="settings-form">
            <p class="text-secondary">Settings UI coming in Phase 2.</p>
          </div>
          <button class="btn btn-primary btn-full" id="btn-export">Export Video</button>
        </div>`;

    case 'EXPORTING':
      return `
        <div class="view exporting-view">
          <header class="view-header">
            <h1 class="view-title">Exporting...</h1>
          </header>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: 0%"></div>
            </div>
            <p class="text-secondary">Preparing export...</p>
          </div>
          <button class="btn btn-secondary btn-full" id="btn-cancel">Cancel</button>
        </div>`;

    case 'COMPLETE':
      return `
        <div class="view complete-view">
          <div class="success-icon">&#10003;</div>
          <h1 class="view-title">Export Complete</h1>
          <button class="btn btn-primary btn-full" id="btn-new-export">New Export</button>
        </div>`;

    case 'ERROR':
      return `
        <div class="view error-view">
          <div class="error-icon">!</div>
          <h1 class="view-title">Error</h1>
          <p class="text-secondary">${state.error?.message ?? 'An unknown error occurred.'}</p>
          ${state.error?.recoverable
            ? '<button class="btn btn-primary btn-full" id="btn-retry">Try Again</button>'
            : ''
          }
        </div>`;

    default:
      return `<div class="view"><p class="text-secondary">Unknown view</p></div>`;
  }
}

function attachEventListeners(state: UIState): void {
  document.querySelectorAll('.flow-item').forEach((el) => {
    el.addEventListener('click', () => {
      const flowId = (el as HTMLElement).dataset.flowId;
      if (flowId) {
        store.dispatch({ type: 'SELECT_FLOW', flowId });
        sendToPlugin({ type: 'SELECT_FLOW', flowId });
      }
    });
  });

  document.getElementById('btn-continue')?.addEventListener('click', () => {
    if (state.selectedFlowId) {
      sendToPlugin({ type: 'PARSE_PROTOTYPE' });
    }
  });

  document.getElementById('btn-export')?.addEventListener('click', () => {
    if (state.selectedFlowId) {
      store.dispatch({ type: 'SET_VIEW', view: 'EXPORTING' });
      sendToPlugin({
        type: 'START_EXPORT',
        flowId: state.selectedFlowId,
        settings: state.exportSettings,
      });
    }
  });

  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    sendToPlugin({ type: 'CANCEL_EXPORT', jobId: '' });
  });

  document.getElementById('btn-new-export')?.addEventListener('click', () => {
    store.dispatch({ type: 'SET_VIEW', view: 'FLOW_SELECT' });
  });

  document.getElementById('btn-retry')?.addEventListener('click', () => {
    store.dispatch({ type: 'SET_ERROR', error: null });
    store.dispatch({ type: 'SET_VIEW', view: 'FLOW_SELECT' });
  });
}

store.subscribe(render);

window.onmessage = (event: MessageEvent) => {
  const message = event.data?.pluginMessage as PluginMessage | undefined;
  if (message) {
    handlePluginMessage(message);
  }
};

render(store.getState());
