/**
 * Identifies and processes scroll regions in the prototype tree.
 *
 * A scroll region is a frame with overflow direction set to scroll.
 * This module extracts scroll metadata, computes content bounds,
 * and identifies sticky elements.
 */

import type { PrototypeNode, ScrollBehavior } from '@/types/prototype';

export interface ScrollRegion {
  readonly nodeId: string;
  readonly nodeName: string;
  readonly behavior: ScrollBehavior;
  readonly nestedScrollIds: string[];
}

export function findScrollRegions(rootNode: PrototypeNode): ScrollRegion[] {
  const regions: ScrollRegion[] = [];
  walkForScrollRegions(rootNode, regions);
  return regions;
}

function walkForScrollRegions(node: PrototypeNode, regions: ScrollRegion[]): void {
  if (node.scrollBehavior && node.scrollBehavior.direction !== 'NONE') {
    const nestedIds: string[] = [];
    findNestedScrolls(node, node.id, nestedIds);

    regions.push({
      nodeId: node.id,
      nodeName: node.name,
      behavior: node.scrollBehavior,
      nestedScrollIds: nestedIds,
    });
  }

  for (const child of node.children) {
    walkForScrollRegions(child, regions);
  }
}

function findNestedScrolls(
  node: PrototypeNode,
  parentScrollId: string,
  result: string[],
): void {
  for (const child of node.children) {
    if (
      child.id !== parentScrollId &&
      child.scrollBehavior &&
      child.scrollBehavior.direction !== 'NONE'
    ) {
      result.push(child.id);
    }
    findNestedScrolls(child, parentScrollId, result);
  }
}

export function computeScrollableDistance(behavior: ScrollBehavior, frameSize: { width: number; height: number }): {
  maxScrollX: number;
  maxScrollY: number;
} {
  return {
    maxScrollX: Math.max(0, behavior.contentSize.width - frameSize.width),
    maxScrollY: Math.max(0, behavior.contentSize.height - frameSize.height),
  };
}
