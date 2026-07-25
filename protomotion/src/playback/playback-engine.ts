/**
 * PlaybackEngine — simulates walking through a Figma prototype.
 *
 * Starting from a flow's entry point, the engine:
 *
 * 1. Enters the starting frame
 * 2. Holds for a configured duration (or AFTER_DELAY fires first)
 * 3. Finds the highest-priority interaction to fire
 * 4. Executes the action → produces PlaybackEvent(s)
 * 5. Advances to the new state
 * 6. Repeats from step 2
 *
 * Termination conditions:
 * - Navigation depth exceeds maxDepth (cycle prevention)
 * - Total timeline exceeds maxDuration
 * - No more interactions to fire on the current frame
 * - Frame has already been visited (no new navigations possible)
 *
 * The engine handles AFTER_DELAY chains: if a frame has an
 * AFTER_DELAY trigger, it fires after the delay without needing
 * a simulated user interaction. Multiple AFTER_DELAY triggers
 * on the same frame fire in delay order.
 */

import type { IPlaybackEngine } from './index';
import type { PrototypeGraph, PrototypeNode } from '@/types/prototype';
import type { PlaybackEvent } from '@/types/timeline';
import type { PlaybackConfig } from '@/core/config';
import { createInitialState, hasVisited } from './state-machine';
import type { PrototypeState } from './state-machine';
import {
  scheduleInteractions,
  getHoldDuration,
} from './trigger-handler';
import type { ScheduledInteraction } from './trigger-handler';
import { executeAction } from './action-handler';
import { getEffectiveDuration } from '@/parser/transition-parser';

export class PlaybackEngine implements IPlaybackEngine {
  async simulate(
    graph: PrototypeGraph,
    flowId: string,
    config: PlaybackConfig,
  ): Promise<PlaybackEvent[]> {
    const flow = graph.flows.find((f) => f.id === flowId || f.startingNodeId === flowId);
    if (!flow) {
      throw new Error(`Flow ${flowId} not found`);
    }

    const startNode = graph.nodes.get(flow.startingNodeId);
    if (!startNode) {
      throw new Error(`Starting node ${flow.startingNodeId} not found`);
    }

    const events: PlaybackEvent[] = [];
    let state = createInitialState(flow.startingNodeId, graph.variables);
    let currentTime = 0;

    while (
      state.depth < config.maxDepth &&
      currentTime < config.maxDuration
    ) {
      const currentNode = this.resolveCurrentNode(state, graph);
      if (!currentNode) break;

      const allInteractions = this.collectInteractions(currentNode, graph);
      const scheduled = scheduleInteractions(allInteractions, config);

      if (scheduled.length === 0) {
        events.push({
          type: 'HOLD',
          time: currentTime,
          sourceNodeId: state.activeFrameId,
          holdDuration: config.defaultHoldDuration,
        });
        break;
      }

      const holdDuration = getHoldDuration(scheduled, config);
      events.push({
        type: 'HOLD',
        time: currentTime,
        sourceNodeId: state.activeFrameId,
        holdDuration: holdDuration,
      });
      currentTime += holdDuration;

      const result = this.fireInteraction(scheduled, state, graph, currentTime);
      if (!result) break;

      events.push(...result.events);
      state = result.newState;

      const transitionDuration = this.getMaxTransitionDuration(result.events);
      currentTime += transitionDuration;

      if (this.isTerminalState(state, graph, config)) {
        events.push({
          type: 'HOLD',
          time: currentTime,
          sourceNodeId: state.activeFrameId,
          holdDuration: config.defaultHoldDuration,
        });
        break;
      }
    }

    return events;
  }

  private resolveCurrentNode(
    state: PrototypeState,
    graph: PrototypeGraph,
  ): PrototypeNode | null {
    if (state.overlays.length > 0) {
      const topOverlay = state.overlays[state.overlays.length - 1];
      return graph.nodes.get(topOverlay.nodeId) ?? null;
    }
    return graph.nodes.get(state.activeFrameId) ?? null;
  }

  private collectInteractions(
    node: PrototypeNode,
    graph: PrototypeGraph,
  ): readonly import('@/types/interactions').Interaction[] {
    const interactions = [...node.interactions];
    this.collectChildInteractions(node, interactions, graph);
    return interactions;
  }

  private collectChildInteractions(
    node: PrototypeNode,
    result: import('@/types/interactions').Interaction[],
    _graph: PrototypeGraph,
  ): void {
    for (const child of node.children) {
      if (child.interactions.length > 0) {
        result.push(...child.interactions);
      }
      this.collectChildInteractions(child, result, _graph);
    }
  }

  private fireInteraction(
    scheduled: readonly ScheduledInteraction[],
    state: PrototypeState,
    graph: PrototypeGraph,
    currentTime: number,
  ): { events: PlaybackEvent[]; newState: PrototypeState } | null {
    for (const item of scheduled) {
      const firstAction = item.interaction.actions[0];
      if (!firstAction) continue;

      if (
        firstAction.type === 'NAVIGATE' &&
        firstAction.destinationId &&
        hasVisited(state, firstAction.destinationId)
      ) {
        continue;
      }

      const allEvents: PlaybackEvent[] = [];
      let currentState = state;

      for (const action of item.interaction.actions) {
        const result = executeAction(action, currentState, graph, currentTime);
        allEvents.push(...result.events);
        currentState = result.newState;
      }

      if (allEvents.length > 0) {
        return { events: allEvents, newState: currentState };
      }
    }

    return null;
  }

  private getMaxTransitionDuration(events: PlaybackEvent[]): number {
    let maxDuration = 0;
    for (const event of events) {
      if (event.transition) {
        const duration = getEffectiveDuration({
          type: event.transition.type,
          duration: event.transition.duration,
          easing: event.transition.easing,
        });
        if (duration > maxDuration) maxDuration = duration;
      }
    }
    return maxDuration;
  }

  private isTerminalState(
    state: PrototypeState,
    graph: PrototypeGraph,
    config: PlaybackConfig,
  ): boolean {
    if (state.depth >= config.maxDepth) return true;

    const node = graph.nodes.get(state.activeFrameId);
    if (!node) return true;

    const allInteractions = this.collectInteractions(node, graph);
    if (allInteractions.length === 0) return true;

    const hasUnvisitedNavigations = allInteractions.some((i) =>
      i.actions.some(
        (a) =>
          a.type === 'NAVIGATE' &&
          'destinationId' in a &&
          a.destinationId &&
          !hasVisited(state, a.destinationId),
      ),
    );
    const hasNonNavigationActions = allInteractions.some((i) =>
      i.actions.some((a) => a.type !== 'NAVIGATE'),
    );

    if (!hasUnvisitedNavigations && !hasNonNavigationActions) return true;

    return false;
  }
}
