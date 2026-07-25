/**
 * Action Handler — executes prototype actions and produces events.
 *
 * Given the current prototype state and an action to execute, this
 * module applies the action to the state machine and returns the
 * resulting PlaybackEvent(s) plus the new state.
 *
 * Some actions produce multiple events (e.g. conditional actions
 * can branch into sub-actions). The handler resolves conditions
 * against the current variable state.
 */

import type { Action, Condition } from '@/types/interactions';
import type { PlaybackEvent, AnimatableValue } from '@/types/timeline';
import type { PrototypeGraph, PrototypeNode } from '@/types/prototype';
import type { Color } from '@/types/primitives';
import {
  navigateTo,
  navigateBack,
  openOverlay,
  closeOverlay,
  swapOverlay,
  setVariable,
  updateScrollPosition,
  changeTo,
} from './state-machine';
import type { PrototypeState } from './state-machine';
import { normalizeTransition, getEffectiveDuration } from '@/parser/transition-parser';

export interface ActionResult {
  readonly events: PlaybackEvent[];
  readonly newState: PrototypeState;
}

export function executeAction(
  action: Action,
  state: PrototypeState,
  graph: PrototypeGraph,
  currentTime: number,
): ActionResult {
  switch (action.type) {
    case 'NAVIGATE':
      return handleNavigate(action, state, currentTime);

    case 'BACK':
      return handleBack(action, state, currentTime);

    case 'OPEN_OVERLAY':
      return handleOpenOverlay(action, state, graph, currentTime);

    case 'CLOSE_OVERLAY':
      return handleCloseOverlay(action, state, currentTime);

    case 'SWAP_OVERLAY':
      return handleSwapOverlay(action, state, graph, currentTime);

    case 'SCROLL_TO':
      return handleScrollTo(action, state, currentTime);

    case 'CHANGE_TO':
      return handleChangeTo(action, state, currentTime);

    case 'SET_VARIABLE':
      return handleSetVariable(action, state, currentTime);

    case 'OPEN_LINK':
      return { events: [], newState: state };

    case 'CONDITIONAL':
      return handleConditional(action, state, graph, currentTime);
  }
}

function handleNavigate(
  action: Extract<Action, { type: 'NAVIGATE' }>,
  state: PrototypeState,
  time: number,
): ActionResult {
  const transition = normalizeTransition(action.transition);
  const newState = navigateTo(state, action.destinationId);

  return {
    events: [
      {
        type: 'NAVIGATE',
        time,
        sourceNodeId: state.activeFrameId,
        destinationNodeId: action.destinationId,
        transition: {
          type: transition.type,
          duration: transition.duration,
          easing: transition.easing,
          direction: transition.direction,
        },
      },
    ],
    newState,
  };
}

function handleBack(
  action: Extract<Action, { type: 'BACK' }>,
  state: PrototypeState,
  time: number,
): ActionResult {
  const newState = navigateBack(state);
  if (!newState) {
    return { events: [], newState: state };
  }

  const transition = normalizeTransition(action.transition);

  return {
    events: [
      {
        type: 'BACK',
        time,
        sourceNodeId: state.activeFrameId,
        destinationNodeId: newState.activeFrameId,
        transition: {
          type: transition.type,
          duration: transition.duration,
          easing: transition.easing,
          direction: transition.direction,
        },
      },
    ],
    newState,
  };
}

function handleOpenOverlay(
  action: Extract<Action, { type: 'OPEN_OVERLAY' }>,
  state: PrototypeState,
  graph: PrototypeGraph,
  time: number,
): ActionResult {
  const frameNode = graph.nodes.get(action.destinationId);
  const newState = openOverlay(
    state,
    action.destinationId,
    action.overlaySettings,
    frameNode,
  );

  const transition = normalizeTransition(action.transition);
  const lastOverlay = newState.overlays[newState.overlays.length - 1];

  return {
    events: [
      {
        type: 'OVERLAY_OPEN',
        time,
        sourceNodeId: state.activeFrameId,
        destinationNodeId: action.destinationId,
        transition: {
          type: transition.type,
          duration: transition.duration,
          easing: transition.easing,
          direction: transition.direction,
        },
        overlayState: lastOverlay,
      },
    ],
    newState,
  };
}

function handleCloseOverlay(
  action: Extract<Action, { type: 'CLOSE_OVERLAY' }>,
  state: PrototypeState,
  time: number,
): ActionResult {
  if (state.overlays.length === 0) {
    return { events: [], newState: state };
  }

  const closingOverlay = state.overlays[state.overlays.length - 1];
  const newState = closeOverlay(state);
  const transition = normalizeTransition(action.transition);

  return {
    events: [
      {
        type: 'OVERLAY_CLOSE',
        time,
        sourceNodeId: closingOverlay.nodeId,
        transition: {
          type: transition.type,
          duration: transition.duration,
          easing: transition.easing,
          direction: transition.direction,
        },
      },
    ],
    newState,
  };
}

function handleSwapOverlay(
  action: Extract<Action, { type: 'SWAP_OVERLAY' }>,
  state: PrototypeState,
  graph: PrototypeGraph,
  time: number,
): ActionResult {
  const frameNode = graph.nodes.get(action.destinationId);
  const newState = swapOverlay(
    state,
    action.destinationId,
    action.overlaySettings,
    frameNode,
  );

  const transition = normalizeTransition(action.transition);
  const lastOverlay = newState.overlays[newState.overlays.length - 1];

  return {
    events: [
      {
        type: 'OVERLAY_SWAP',
        time,
        sourceNodeId: state.activeFrameId,
        destinationNodeId: action.destinationId,
        transition: {
          type: transition.type,
          duration: transition.duration,
          easing: transition.easing,
          direction: transition.direction,
        },
        overlayState: lastOverlay,
      },
    ],
    newState,
  };
}

function handleScrollTo(
  action: Extract<Action, { type: 'SCROLL_TO' }>,
  state: PrototypeState,
  time: number,
): ActionResult {
  const newState = updateScrollPosition(
    state,
    action.scrollTarget.nodeId,
    action.scrollTarget.offset,
  );
  const transition = normalizeTransition(action.transition);

  return {
    events: [
      {
        type: 'SCROLL',
        time,
        sourceNodeId: state.activeFrameId,
        destinationNodeId: action.scrollTarget.nodeId,
        scrollDelta: action.scrollTarget.offset,
        transition: {
          type: transition.type,
          duration: transition.duration,
          easing: transition.easing,
          direction: transition.direction,
        },
      },
    ],
    newState,
  };
}

function handleChangeTo(
  action: Extract<Action, { type: 'CHANGE_TO' }>,
  state: PrototypeState,
  time: number,
): ActionResult {
  const transition = normalizeTransition(action.transition);
  const newState = changeTo(state, action.destinationId);

  return {
    events: [
      {
        type: 'COMPONENT_CHANGE',
        time,
        sourceNodeId: state.activeFrameId,
        destinationNodeId: action.destinationId,
        transition: {
          type: transition.type,
          duration: transition.duration,
          easing: transition.easing,
          direction: transition.direction,
        },
      },
    ],
    newState,
  };
}

function handleSetVariable(
  action: Extract<Action, { type: 'SET_VARIABLE' }>,
  state: PrototypeState,
  time: number,
): ActionResult {
  const newState = setVariable(
    state,
    action.assignment.variableId,
    action.assignment.value as AnimatableValue,
  );

  return {
    events: [
      {
        type: 'VARIABLE_SET',
        time,
        sourceNodeId: state.activeFrameId,
        variableId: action.assignment.variableId,
        variableValue: action.assignment.value as AnimatableValue,
      },
    ],
    newState,
  };
}

function handleConditional(
  action: Extract<Action, { type: 'CONDITIONAL' }>,
  state: PrototypeState,
  graph: PrototypeGraph,
  time: number,
): ActionResult {
  for (const branch of action.branches) {
    if (evaluateCondition(branch.condition, state)) {
      const allEvents: PlaybackEvent[] = [];
      let currentState = state;
      for (const branchAction of branch.actions) {
        const result = executeAction(branchAction, currentState, graph, time);
        allEvents.push(...result.events);
        currentState = result.newState;
      }
      return { events: allEvents, newState: currentState };
    }
  }

  if (action.fallbackActions) {
    const allEvents: PlaybackEvent[] = [];
    let currentState = state;
    for (const fallback of action.fallbackActions) {
      const result = executeAction(fallback, currentState, graph, time);
      allEvents.push(...result.events);
      currentState = result.newState;
    }
    return { events: allEvents, newState: currentState };
  }

  return { events: [], newState: state };
}

function evaluateCondition(condition: Condition, state: PrototypeState): boolean {
  const currentValue = state.variables.get(condition.variableId);
  if (currentValue === undefined) return false;

  const target = condition.value;

  switch (condition.operator) {
    case 'EQUALS':
      return valuesEqual(currentValue, target);
    case 'NOT_EQUALS':
      return !valuesEqual(currentValue, target);
    case 'GREATER_THAN':
      return typeof currentValue === 'number' && typeof target === 'number' && currentValue > target;
    case 'LESS_THAN':
      return typeof currentValue === 'number' && typeof target === 'number' && currentValue < target;
    case 'CONTAINS':
      return typeof currentValue === 'string' && typeof target === 'string' && currentValue.includes(target);
    default:
      return false;
  }
}

function valuesEqual(a: AnimatableValue, b: string | number | boolean): boolean {
  if (typeof a === 'object' && a !== null && 'r' in a) {
    return false;
  }
  return a === b;
}
