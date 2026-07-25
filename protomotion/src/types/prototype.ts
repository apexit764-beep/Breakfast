/**
 * Prototype Graph — the complete structural representation of a Figma
 * prototype after parsing.
 *
 * This is the intermediate representation between raw Figma API data and
 * the render timeline. The parser builds this graph; the playback engine
 * walks it to simulate interactions; the timeline builder reads it to
 * generate animation tracks.
 *
 * Every node carries its full visual state (AnimatableStyle) so the renderer
 * can reconstruct any frame without calling back into the Figma API.
 */

import type {
  AutoLayoutProperties,
  Bounds,
  Color,
  Constraints,
  CornerRadius,
  Effect,
  Paint,
  Size,
  Stroke,
  TextStyle,
  Vector2D,
} from './primitives';
import type { Interaction } from './interactions';

// ─── Node Types ──────────────────────────────────────────────────────────────

export type PrototypeNodeType =
  | 'FRAME'
  | 'GROUP'
  | 'COMPONENT'
  | 'COMPONENT_SET'
  | 'INSTANCE'
  | 'RECTANGLE'
  | 'ELLIPSE'
  | 'POLYGON'
  | 'STAR'
  | 'LINE'
  | 'VECTOR'
  | 'TEXT'
  | 'BOOLEAN_OPERATION'
  | 'SECTION';

// ─── Scroll ──────────────────────────────────────────────────────────────────

export type ScrollDirection = 'VERTICAL' | 'HORIZONTAL' | 'BOTH' | 'NONE';
export type ScrollBehaviorType = 'SCROLLS' | 'FIXED';

export interface ScrollBehavior {
  readonly direction: ScrollDirection;
  readonly overflow: ScrollBehaviorType;
  readonly scrollOffset: Vector2D;
  readonly contentSize: Size;
  readonly hasScrollMomentum: boolean;
  readonly snapToGrid: boolean;
  readonly stickyChildren: readonly string[]; // node IDs of sticky elements
}

// ─── Component Properties ────────────────────────────────────────────────────

export type ComponentPropertyType = 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT';

export interface ComponentProperty {
  readonly name: string;
  readonly type: ComponentPropertyType;
  readonly value: string | boolean;
  readonly defaultValue: string | boolean;
  readonly variantOptions?: readonly string[];
}

// ─── Animatable Style ────────────────────────────────────────────────────────
// Every visual property that Smart Animate can interpolate lives here.

export interface AnimatableStyle {
  readonly position: Vector2D;
  readonly size: Size;
  readonly rotation: number; // degrees
  readonly opacity: number; // 0–1
  readonly cornerRadius: CornerRadius;
  readonly fills: readonly Paint[];
  readonly strokes: readonly Stroke[];
  readonly effects: readonly Effect[];
  readonly clipContent: boolean;
  readonly visible: boolean;
  readonly blendMode: string;
}

// ─── Prototype Node ──────────────────────────────────────────────────────────

export interface PrototypeNode {
  readonly id: string;
  readonly name: string;
  readonly type: PrototypeNodeType;
  readonly bounds: Bounds;
  readonly absoluteBounds: Bounds;
  readonly style: AnimatableStyle;
  readonly children: readonly PrototypeNode[];
  readonly interactions: readonly Interaction[];
  readonly parentId: string | null;

  readonly scrollBehavior?: ScrollBehavior;
  readonly constraints?: Constraints;
  readonly layoutProperties?: AutoLayoutProperties;
  readonly componentProperties?: ReadonlyMap<string, ComponentProperty>;
  readonly textContent?: string;
  readonly textStyle?: TextStyle;

  readonly isTopLevelFrame: boolean;
  readonly isMask: boolean;
  readonly exportSettings?: readonly NodeExportSetting[];
}

export interface NodeExportSetting {
  readonly format: 'PNG' | 'JPG' | 'SVG' | 'PDF';
  readonly suffix: string;
  readonly constraint: { type: 'SCALE' | 'WIDTH' | 'HEIGHT'; value: number };
}

// ─── Prototype Flow ──────────────────────────────────────────────────────────

export interface PrototypeFlow {
  readonly id: string;
  readonly name: string;
  readonly startingNodeId: string;
  readonly description?: string;
}

// ─── Variables ───────────────────────────────────────────────────────────────

export type VariableType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';

export interface PrototypeVariable {
  readonly id: string;
  readonly name: string;
  readonly type: VariableType;
  readonly defaultValue: string | number | boolean | Color;
  readonly collectionId: string;
  readonly collectionName: string;
}

// ─── Device Frame ────────────────────────────────────────────────────────────

export type DeviceType =
  | 'NONE'
  | 'IPHONE_14'
  | 'IPHONE_14_PRO'
  | 'IPHONE_15'
  | 'IPHONE_15_PRO'
  | 'IPHONE_SE'
  | 'PIXEL_7'
  | 'GALAXY_S23'
  | 'IPAD_PRO_11'
  | 'IPAD_PRO_12_9'
  | 'MACBOOK_PRO'
  | 'SURFACE_PRO'
  | 'CUSTOM';

export interface DeviceFrame {
  readonly type: DeviceType;
  readonly size: Size;
  readonly presetBackgroundColor?: Color;
}

// ─── Prototype Graph (root) ──────────────────────────────────────────────────

export interface PrototypeGraph {
  readonly documentName: string;
  readonly pageName: string;
  readonly flows: readonly PrototypeFlow[];
  readonly nodes: ReadonlyMap<string, PrototypeNode>;
  readonly topLevelFrames: readonly string[]; // node IDs
  readonly variables: readonly PrototypeVariable[];
  readonly deviceFrame: DeviceFrame;
  readonly backgroundColor: Color;
}

// ─── Asset Reference ─────────────────────────────────────────────────────────
// Resolved image fills and exported node rasters, keyed by hash or node ID.

export interface AssetMap {
  readonly images: ReadonlyMap<string, Uint8Array>;   // imageHash → bytes
  readonly rasters: ReadonlyMap<string, Uint8Array>;  // nodeId → rendered PNG
}
