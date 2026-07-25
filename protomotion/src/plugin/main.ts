/**
 * Plugin sandbox entry point.
 *
 * Runs in Figma's main thread with access to the Figma Plugin API.
 * Communicates with the UI iframe via figma.ui.postMessage/onmessage.
 *
 * This file wires together the API readers and parser, then listens for
 * UI messages to drive the export pipeline.
 */

import type { UIMessage, PluginMessage } from '@/types/messages';

const PLUGIN_VERSION = '0.1.0';
const UI_SIZE = { width: 400, height: 600 };

function sendToUI(message: PluginMessage): void {
  figma.ui.postMessage(message);
}

function handleUIMessage(message: UIMessage): void {
  switch (message.type) {
    case 'REQUEST_FLOWS':
      handleRequestFlows();
      break;
    case 'PARSE_PROTOTYPE':
      handleParsePrototype();
      break;
    case 'SELECT_FLOW':
      handleSelectFlow(message.flowId);
      break;
    case 'START_EXPORT':
      handleStartExport(message.flowId, message.settings);
      break;
    case 'CANCEL_EXPORT':
      handleCancelExport(message.jobId);
      break;
    case 'UPDATE_SETTINGS':
      break;
    case 'START_BATCH_EXPORT':
      break;
  }
}

function handleRequestFlows(): void {
  const page = figma.currentPage;
  const flows = page.flowStartingPoints.map((flow) => ({
    id: flow.nodeId,
    name: flow.name,
    startingNodeId: flow.nodeId,
  }));

  sendToUI({
    type: 'FLOWS_AVAILABLE',
    flows,
    documentName: figma.root.name,
    pageName: page.name,
  });
}

function handleParsePrototype(): void {
  sendToUI({
    type: 'ERROR',
    code: 'NOT_IMPLEMENTED',
    message: 'Parser module not yet implemented. Coming in Phase 2.',
    recoverable: true,
  });
}

function handleSelectFlow(_flowId: string): void {
  // Will trigger parse + timeline build in Phase 2
}

function handleStartExport(
  _flowId: string,
  _settings: import('@/types/export').ExportSettings,
): void {
  sendToUI({
    type: 'ERROR',
    code: 'NOT_IMPLEMENTED',
    message: 'Export pipeline not yet implemented. Coming in Phase 3.',
    recoverable: true,
  });
}

function handleCancelExport(_jobId: string): void {
  // Will cancel active export job
}

figma.showUI(__html__, {
  width: UI_SIZE.width,
  height: UI_SIZE.height,
  themeColors: true,
});

sendToUI({ type: 'PLUGIN_READY', version: PLUGIN_VERSION });

figma.ui.onmessage = (message: UIMessage) => {
  handleUIMessage(message);
};

figma.on('close', () => {
  // Cleanup resources
});
