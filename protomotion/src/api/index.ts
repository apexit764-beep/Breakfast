/**
 * Figma API abstraction layer.
 *
 * This module is the ONLY place that touches the Figma Plugin API directly.
 * Everything else works with ProtoMotion's own types (from src/types/).
 *
 * Why abstract the Figma API?
 *
 * 1. **Testability** — modules can be unit-tested with mock implementations
 *    of these interfaces, without needing a Figma environment.
 *
 * 2. **API insulation** — when Figma updates their API (new properties,
 *    renamed fields, deprecations), only this module changes.
 *
 * 3. **Type safety** — Figma's types are nullable/optional in places where
 *    our pipeline needs guarantees. The readers normalize and validate.
 */

export type { IDocumentReader } from './document-reader';
export type { INodeReader } from './node-reader';
export type { IPrototypeReader } from './prototype-reader';
export type { IAssetReader } from './asset-reader';
