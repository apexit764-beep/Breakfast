/**
 * Parser module — converts raw Figma API data into a PrototypeGraph.
 *
 * The parser is the first stage of the export pipeline. It walks the
 * Figma document tree using the API layer, extracts all prototype-relevant
 * data, and produces a self-contained PrototypeGraph that the rest of the
 * pipeline can process without any further Figma API calls.
 *
 * This module contains:
 * - GraphBuilder:       Orchestrates the full parse, producing a PrototypeGraph
 * - InteractionParser:  Converts Figma Reactions into typed Interaction objects
 * - TransitionParser:   Extracts transition and easing metadata
 * - StyleExtractor:     Reads all animatable visual properties from a node
 * - ScrollParser:       Identifies scroll regions and their configuration
 */

import type { PrototypeGraph } from '@/types/prototype';

export interface IPrototypeParser {
  parse(flowId: string): Promise<PrototypeGraph>;
}

export type { IPrototypeParser as default };
