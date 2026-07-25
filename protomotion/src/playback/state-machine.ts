/**
 * Prototype State Machine.
 *
 * Tracks the runtime state of a prototype simulation:
 * - Current active frame
 * - Navigation history stack (for BACK actions)
 * - Active overlay stack (ordered, newest on top)
 * - Variable values
 * - Visited frame set (for cycle detection)
 *
 * The state machine is purely functional from the outside — every
 * mutation returns a new snapshot, making it easy to reason about
 * and test.
 */

import type { AnimatableValue, OverlayState } from '@/types/timeline';
import type { OverlaySettings, OverlayPosition } from '@/types/interactions';
import type { PrototypeVariable, PrototypeNode } from '@/types/prototype';
import type { Vector2D } from '@/types/primitives';

export interface PrototypeState {
  readonly activeFrameId: string;
  readonly navigationStack: readonly string[];
  readonly overlays: readonly OverlayState[];
  readonly variables: ReadonlyMap<string, AnimatableValue>;
  readonly scrollPositions: ReadonlyMap<string, Vector2D>;
  readonly visitedFrames: ReadonlySet<string>;
  readonly depth: number;
}

export function createInitialState(
  startingFrameId: string,
  variables: readonly PrototypeVariable[],
): PrototypeState {
  const varMap = new Map<string, AnimatableValue>();
  for (const v of variables) {
    varMap.set(v.id, v.defaultValue as AnimatableValue);
  }

  return {
    activeFrameId: startingFrameId,
    navigationStack: [],
    overlays: [],
    variables: varMap,
    scrollPositions: new Map(),
    visitedFrames: new Set([startingFrameId]),
    depth: 0,
  };
}

export function navigateTo(state: PrototypeState, destinationId: string): PrototypeState {
  const newStack = [...state.navigationStack, state.activeFrameId];
  const newVisited = new Set(state.visitedFrames);
  newVisited.add(destinationId);

  return {
    ...state,
    activeFrameId: destinationId,
    navigationStack: newStack,
    overlays: [],
    scrollPositions: new Map(),
    visitedFrames: newVisited,
    depth: state.depth + 1,
  };
}

export function navigateBack(state: PrototypeState): PrototypeState | null {
  if (state.navigationStack.length === 0) return null;

  const newStack = [...state.navigationStack];
  const previousId = newStack.pop()!;

  return {
    ...state,
    activeFrameId: previousId,
    navigationStack: newStack,
    overlays: [],
    scrollPositions: new Map(),
    depth: state.depth + 1,
  };
}

export function openOverlay(
  state: PrototypeState,
  nodeId: string,
  settings: OverlaySettings,
  frameNode: PrototypeNode | undefined,
): PrototypeState {
  const position = computeOverlayPosition(settings, frameNode);

  const overlay: OverlayState = {
    nodeId,
    position,
    dimBackground: settings.backgroundInteraction === 'CLOSE_ON_CLICK_OUTSIDE',
    dimColor: settings.backgroundDimColor,
  };

  return {
    ...state,
    overlays: [...state.overlays, overlay],
    depth: state.depth + 1,
  };
}

export function closeOverlay(state: PrototypeState): PrototypeState {
  if (state.overlays.length === 0) return state;

  return {
    ...state,
    overlays: state.overlays.slice(0, -1),
    depth: state.depth + 1,
  };
}

export function swapOverlay(
  state: PrototypeState,
  nodeId: string,
  settings: OverlaySettings,
  frameNode: PrototypeNode | undefined,
): PrototypeState {
  const closed = closeOverlay(state);
  return openOverlay(closed, nodeId, settings, frameNode);
}

export function setVariable(
  state: PrototypeState,
  variableId: string,
  value: AnimatableValue,
): PrototypeState {
  const newVars = new Map(state.variables);
  newVars.set(variableId, value);

  return {
    ...state,
    variables: newVars,
  };
}

export function updateScrollPosition(
  state: PrototypeState,
  nodeId: string,
  position: Vector2D,
): PrototypeState {
  const newPositions = new Map(state.scrollPositions);
  newPositions.set(nodeId, position);

  return {
    ...state,
    scrollPositions: newPositions,
  };
}

export function hasVisited(state: PrototypeState, frameId: string): boolean {
  return state.visitedFrames.has(frameId);
}

export function changeTo(state: PrototypeState, destinationId: string): PrototypeState {
  return {
    ...state,
    depth: state.depth + 1,
  };
}

function computeOverlayPosition(
  settings: OverlaySettings,
  _frameNode: PrototypeNode | undefined,
): Vector2D {
  if (settings.position === 'MANUAL') {
    return settings.offset;
  }

  const POSITION_MAP: Record<OverlayPosition, Vector2D> = {
    CENTER: { x: 0, y: 0 },
    TOP_LEFT: { x: 0, y: 0 },
    TOP_CENTER: { x: 0, y: 0 },
    TOP_RIGHT: { x: 0, y: 0 },
    BOTTOM_LEFT: { x: 0, y: 0 },
    BOTTOM_CENTER: { x: 0, y: 0 },
    BOTTOM_RIGHT: { x: 0, y: 0 },
    MANUAL: settings.offset,
  };

  return POSITION_MAP[settings.position] ?? { x: 0, y: 0 };
}
