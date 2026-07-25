/**
 * Reads and exports image assets from nodes.
 *
 * For image fills, Figma stores a hash reference. This reader resolves
 * those hashes to actual pixel data. It also handles rasterizing vector
 * nodes that are too complex to reconstruct in our renderer.
 */

export interface IAssetReader {
  getImageBytes(imageHash: string): Promise<Uint8Array | null>;
  exportNodeAsPNG(nodeId: string, scale: number): Promise<Uint8Array>;
  exportNodeAsSVG(nodeId: string): Promise<string>;
  getImageHashes(nodeId: string): string[];
}
