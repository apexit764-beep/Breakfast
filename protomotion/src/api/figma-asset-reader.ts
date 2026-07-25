/**
 * IAssetReader implementation backed by the Figma Plugin API.
 *
 * Handles image fill resolution and node rasterization.
 * Uses Figma's exportAsync API for node rendering and
 * getImageByHash for resolving image fill references.
 */

import type { IAssetReader } from './asset-reader';

export class FigmaAssetReader implements IAssetReader {
  async getImageBytes(imageHash: string): Promise<Uint8Array | null> {
    try {
      const image = figma.getImageByHash(imageHash);
      if (!image) return null;
      return await image.getBytesAsync();
    } catch {
      return null;
    }
  }

  async exportNodeAsPNG(nodeId: string, scale: number): Promise<Uint8Array> {
    const node = figma.getNodeById(nodeId) as SceneNode;
    if (!node) {
      throw new Error(`Node ${nodeId} not found for PNG export`);
    }
    return await (node as ExportMixin).exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: scale },
    });
  }

  async exportNodeAsSVG(nodeId: string): Promise<string> {
    const node = figma.getNodeById(nodeId) as SceneNode;
    if (!node) {
      throw new Error(`Node ${nodeId} not found for SVG export`);
    }
    const bytes = await (node as ExportMixin).exportAsync({ format: 'SVG' });
    return new TextDecoder().decode(bytes);
  }

  getImageHashes(nodeId: string): string[] {
    const node = figma.getNodeById(nodeId) as SceneNode;
    if (!node || !('fills' in node)) return [];

    const hashes: string[] = [];
    const fills = (node as GeometryMixin).fills;
    if (fills && fills !== figma.mixed) {
      for (const fill of fills as readonly Paint[]) {
        if (fill.type === 'IMAGE' && 'imageHash' in fill) {
          const hash = (fill as ImagePaint).imageHash;
          if (hash) hashes.push(hash);
        }
      }
    }
    return hashes;
  }
}
