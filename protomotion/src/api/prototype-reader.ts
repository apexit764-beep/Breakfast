/**
 * Reads prototype-specific data: interactions, transitions, variables.
 *
 * This reader extracts the prototype graph metadata that isn't part of
 * the visual tree — the reactions (trigger → action + transition),
 * scroll behaviors, component properties, and variable bindings.
 */

import type { Interaction } from '@/types/interactions';
import type { ScrollBehavior, ComponentProperty, PrototypeVariable } from '@/types/prototype';

export interface IPrototypeReader {
  readInteractions(nodeId: string): Interaction[];
  readScrollBehavior(nodeId: string): ScrollBehavior | undefined;
  readComponentProperties(nodeId: string): Map<string, ComponentProperty>;
  readVariables(): PrototypeVariable[];
  getInteractiveNodeIds(): string[];
}
