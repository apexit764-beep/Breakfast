/**
 * GraphBuilder — the parser's orchestrator.
 *
 * Coordinates the API readers to walk the Figma document tree and
 * produce a self-contained PrototypeGraph. After this method returns,
 * no further Figma API calls are needed for the export pipeline.
 *
 * Walk order:
 * 1. Read document metadata (flows, background, device frame)
 * 2. Read all top-level frames and their subtrees
 * 3. Attach interactions to each node
 * 4. Attach scroll behaviors
 * 5. Attach component properties
 * 6. Read variables
 * 7. Validate and assemble the graph
 */

import type { IPrototypeParser } from './index';
import type { IDocumentReader } from '@/api/document-reader';
import type { INodeReader } from '@/api/node-reader';
import type { IPrototypeReader } from '@/api/prototype-reader';
import type { PrototypeGraph, PrototypeNode, PrototypeFlow } from '@/types/prototype';
import { parseNodeInteractions } from './interaction-parser';
import { normalizeStyle } from './style-extractor';

export class GraphBuilder implements IPrototypeParser {
  private readonly documentReader: IDocumentReader;
  private readonly nodeReader: INodeReader;
  private readonly prototypeReader: IPrototypeReader;
  private readonly parseWarnings: string[] = [];

  constructor(
    documentReader: IDocumentReader,
    nodeReader: INodeReader,
    prototypeReader: IPrototypeReader,
  ) {
    this.documentReader = documentReader;
    this.nodeReader = nodeReader;
    this.prototypeReader = prototypeReader;
  }

  async parse(_flowId: string): Promise<PrototypeGraph> {
    const docInfo = this.documentReader.getDocumentInfo();
    const flows = this.documentReader.getPrototypeFlows();
    const backgroundColor = this.documentReader.getPageBackgroundColor();
    const deviceFrame = this.documentReader.getDeviceFrame();
    const topLevelFrameIds = this.documentReader.getTopLevelFrameIds();

    const nodes = new Map<string, PrototypeNode>();

    for (const frameId of topLevelFrameIds) {
      const tree = this.nodeReader.readNodeTree(frameId);
      const enriched = this.enrichNodeTree(tree, nodes);
      nodes.set(enriched.id, enriched);
    }

    this.resolveFlowStartingNodes(flows, nodes);

    const variables = this.prototypeReader.readVariables();

    if (this.parseWarnings.length > 0) {
      console.log(
        `[ProtoMotion] Parse completed with ${this.parseWarnings.length} warning(s):`,
        this.parseWarnings,
      );
    }

    return {
      documentName: docInfo.name,
      pageName: docInfo.currentPageName,
      flows,
      nodes,
      topLevelFrames: topLevelFrameIds,
      variables,
      deviceFrame,
      backgroundColor,
    };
  }

  getWarnings(): string[] {
    return [...this.parseWarnings];
  }

  private enrichNodeTree(
    node: PrototypeNode,
    allNodes: Map<string, PrototypeNode>,
  ): PrototypeNode {
    const rawInteractions = this.prototypeReader.readInteractions(node.id);
    const scrollBehavior = this.prototypeReader.readScrollBehavior(node.id);
    const componentProperties =
      node.type === 'INSTANCE' || node.type === 'COMPONENT_SET'
        ? this.prototypeReader.readComponentProperties(node.id)
        : undefined;

    const { interactions, warnings } = parseNodeInteractions(
      node,
      rawInteractions,
      (id) => this.nodeReader.nodeExists(id),
    );
    this.parseWarnings.push(...warnings);

    const enrichedChildren = node.children.map((child) =>
      this.enrichNodeTree(child, allNodes),
    );

    const enriched: PrototypeNode = {
      ...node,
      style: normalizeStyle(node.style),
      interactions,
      children: enrichedChildren,
      scrollBehavior: scrollBehavior ?? node.scrollBehavior,
      componentProperties: componentProperties ?? node.componentProperties,
    };

    allNodes.set(enriched.id, enriched);

    return enriched;
  }

  private resolveFlowStartingNodes(
    flows: PrototypeFlow[],
    nodes: Map<string, PrototypeNode>,
  ): void {
    for (const flow of flows) {
      if (!nodes.has(flow.startingNodeId)) {
        this.parseWarnings.push(
          `Flow "${flow.name}" references node ${flow.startingNodeId} which was not found in the parsed tree`,
        );
      }
    }
  }
}
