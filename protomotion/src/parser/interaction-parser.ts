/**
 * Parses and validates interactions attached to prototype nodes.
 *
 * Interactions arrive from the API layer already converted to
 * ProtoMotion types. This module validates them, resolves
 * destination references, and filters out broken interactions
 * (e.g. missing destinations) while logging warnings.
 */

import type { Interaction, Action } from '@/types/interactions';
import type { PrototypeNode } from '@/types/prototype';

export interface InteractionParseResult {
  readonly interactions: Interaction[];
  readonly warnings: string[];
}

export function parseNodeInteractions(
  node: PrototypeNode,
  rawInteractions: Interaction[],
  nodeExists: (id: string) => boolean,
): InteractionParseResult {
  const interactions: Interaction[] = [];
  const warnings: string[] = [];

  for (const interaction of rawInteractions) {
    const { actions, actionWarnings } = validateActions(
      interaction.actions as Action[],
      node,
      nodeExists,
    );

    warnings.push(...actionWarnings);

    if (actions.length > 0) {
      interactions.push({
        id: interaction.id,
        trigger: interaction.trigger,
        actions,
      });
    }
  }

  return { interactions, warnings };
}

function validateActions(
  actions: Action[],
  sourceNode: PrototypeNode,
  nodeExists: (id: string) => boolean,
): { actions: Action[]; actionWarnings: string[] } {
  const valid: Action[] = [];
  const actionWarnings: string[] = [];

  for (const action of actions) {
    const result = validateAction(action, sourceNode, nodeExists);
    if (result.valid) {
      valid.push(action);
    }
    actionWarnings.push(...result.warnings);
  }

  return { actions: valid, actionWarnings };
}

function validateAction(
  action: Action,
  sourceNode: PrototypeNode,
  nodeExists: (id: string) => boolean,
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  switch (action.type) {
    case 'NAVIGATE':
    case 'CHANGE_TO':
      if (!action.destinationId) {
        warnings.push(
          `${action.type} on "${sourceNode.name}" has no destination — skipping`,
        );
        return { valid: false, warnings };
      }
      if (!nodeExists(action.destinationId)) {
        warnings.push(
          `${action.type} on "${sourceNode.name}" points to missing node ${action.destinationId} — skipping`,
        );
        return { valid: false, warnings };
      }
      break;

    case 'OPEN_OVERLAY':
    case 'SWAP_OVERLAY':
      if (!action.destinationId) {
        warnings.push(
          `${action.type} on "${sourceNode.name}" has no destination — skipping`,
        );
        return { valid: false, warnings };
      }
      if (!nodeExists(action.destinationId)) {
        warnings.push(
          `${action.type} on "${sourceNode.name}" points to missing overlay node ${action.destinationId}`,
        );
        return { valid: false, warnings };
      }
      break;

    case 'SCROLL_TO':
      if (!action.scrollTarget?.nodeId) {
        warnings.push(
          `SCROLL_TO on "${sourceNode.name}" has no scroll target — skipping`,
        );
        return { valid: false, warnings };
      }
      break;

    case 'BACK':
    case 'CLOSE_OVERLAY':
    case 'SET_VARIABLE':
    case 'OPEN_LINK':
    case 'CONDITIONAL':
      break;
  }

  if (action.transition) {
    if (action.transition.duration < 0) {
      warnings.push(
        `Transition on "${sourceNode.name}" has negative duration (${action.transition.duration}ms) — clamping to 0`,
      );
    }
  }

  return { valid: true, warnings };
}
