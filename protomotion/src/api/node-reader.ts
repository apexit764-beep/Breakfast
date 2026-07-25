/**
 * Reads individual node properties from the Figma API.
 *
 * Responsible for converting Figma's SceneNode types into our
 * PrototypeNode representation, including all visual properties
 * needed for rendering (fills, strokes, effects, layout, etc.).
 */

import type { PrototypeNode } from '@/types/prototype';
import type { AnimatableStyle } from '@/types/prototype';
import type { Bounds } from '@/types/primitives';

export interface INodeReader {
  readNode(nodeId: string): PrototypeNode | null;
  readNodeTree(rootId: string): PrototypeNode;
  readStyle(nodeId: string): AnimatableStyle;
  readBounds(nodeId: string): Bounds;
  readAbsoluteBounds(nodeId: string): Bounds;
  getChildIds(nodeId: string): string[];
  isVisible(nodeId: string): boolean;
  nodeExists(nodeId: string): boolean;
}
