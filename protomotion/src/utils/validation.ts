import type { Interaction, Trigger, Action, Transition } from '@/types/interactions';
import type { PrototypeNode, PrototypeGraph, PrototypeFlow } from '@/types/prototype';

export interface ValidationResult {
  readonly valid: boolean;
  readonly warnings: readonly ValidationWarning[];
  readonly errors: readonly ValidationError[];
}

export interface ValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
  readonly nodeName?: string;
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
  readonly nodeName?: string;
  readonly fatal: boolean;
}

export function validateGraph(graph: PrototypeGraph): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationError[] = [];

  if (graph.flows.length === 0) {
    errors.push({
      code: 'NO_FLOWS',
      message: 'No prototype flows found. Define at least one flow starting point.',
      fatal: true,
    });
  }

  for (const flow of graph.flows) {
    validateFlow(flow, graph, warnings, errors);
  }

  for (const node of graph.nodes.values()) {
    validateNode(node, graph, warnings, errors);
  }

  return {
    valid: errors.filter((e) => e.fatal).length === 0,
    warnings,
    errors,
  };
}

function validateFlow(
  flow: PrototypeFlow,
  graph: PrototypeGraph,
  _warnings: ValidationWarning[],
  errors: ValidationError[],
): void {
  if (!graph.nodes.has(flow.startingNodeId)) {
    errors.push({
      code: 'MISSING_FLOW_START',
      message: `Flow "${flow.name}" references non-existent starting node ${flow.startingNodeId}`,
      fatal: true,
    });
  }
}

function validateNode(
  node: PrototypeNode,
  graph: PrototypeGraph,
  warnings: ValidationWarning[],
  errors: ValidationError[],
): void {
  for (const interaction of node.interactions) {
    validateInteraction(interaction, node, graph, warnings, errors);
  }
}

function validateInteraction(
  interaction: Interaction,
  node: PrototypeNode,
  graph: PrototypeGraph,
  warnings: ValidationWarning[],
  errors: ValidationError[],
): void {
  validateTrigger(interaction.trigger, node, warnings);

  for (const action of interaction.actions) {
    validateAction(action, node, graph, warnings, errors);
  }
}

function validateTrigger(
  trigger: Trigger,
  node: PrototypeNode,
  warnings: ValidationWarning[],
): void {
  if (trigger.type === 'AFTER_DELAY' && trigger.delay <= 0) {
    warnings.push({
      code: 'INVALID_DELAY',
      message: `Node "${node.name}" has AFTER_DELAY trigger with non-positive delay`,
      nodeId: node.id,
      nodeName: node.name,
    });
  }
}

function validateAction(
  action: Action,
  node: PrototypeNode,
  graph: PrototypeGraph,
  warnings: ValidationWarning[],
  errors: ValidationError[],
): void {
  if ('destinationId' in action && action.destinationId) {
    if (!graph.nodes.has(action.destinationId)) {
      errors.push({
        code: 'MISSING_DESTINATION',
        message: `Node "${node.name}" has ${action.type} action pointing to non-existent node ${action.destinationId}`,
        nodeId: node.id,
        nodeName: node.name,
        fatal: false,
      });
    }
  }

  if (action.transition) {
    validateTransition(action.transition, node, warnings);
  }
}

function validateTransition(
  transition: Transition,
  node: PrototypeNode,
  warnings: ValidationWarning[],
): void {
  if (transition.duration < 0) {
    warnings.push({
      code: 'NEGATIVE_DURATION',
      message: `Node "${node.name}" has transition with negative duration`,
      nodeId: node.id,
      nodeName: node.name,
    });
  }

  if (transition.type === 'SMART_ANIMATE' && transition.duration === 0) {
    warnings.push({
      code: 'ZERO_SMART_ANIMATE',
      message: `Node "${node.name}" has Smart Animate with zero duration (will behave as instant)`,
      nodeId: node.id,
      nodeName: node.name,
    });
  }
}
