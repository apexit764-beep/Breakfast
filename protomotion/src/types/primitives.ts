/**
 * Foundational geometric and color primitives used throughout ProtoMotion.
 *
 * These are decoupled from Figma's own types so the timeline, renderer, and
 * export modules never depend on the Figma Plugin API directly — only the
 * parser/api layer touches Figma types and converts them into these primitives.
 */

// ─── Geometry ────────────────────────────────────────────────────────────────

export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Matrix2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

export interface CornerRadius {
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomRight: number;
  readonly bottomLeft: number;
}

// ─── Color ───────────────────────────────────────────────────────────────────

export interface Color {
  readonly r: number; // 0–1
  readonly g: number; // 0–1
  readonly b: number; // 0–1
  readonly a: number; // 0–1
}

// ─── Paint ───────────────────────────────────────────────────────────────────

export type PaintType = 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE';

export interface GradientStop {
  readonly position: number; // 0–1
  readonly color: Color;
}

export interface Paint {
  readonly type: PaintType;
  readonly visible: boolean;
  readonly opacity: number;
  readonly color?: Color;
  readonly gradientStops?: readonly GradientStop[];
  readonly gradientTransform?: Matrix2D;
  readonly imageHash?: string;
  readonly scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE';
}

// ─── Stroke ──────────────────────────────────────────────────────────────────

export type StrokeAlign = 'INSIDE' | 'OUTSIDE' | 'CENTER';
export type StrokeCap = 'NONE' | 'ROUND' | 'SQUARE' | 'ARROW_LINES' | 'ARROW_EQUILATERAL';
export type StrokeJoin = 'MITER' | 'BEVEL' | 'ROUND';

export interface Stroke {
  readonly color: Color;
  readonly weight: number;
  readonly align: StrokeAlign;
  readonly cap: StrokeCap;
  readonly join: StrokeJoin;
  readonly dashPattern: readonly number[];
  readonly visible: boolean;
  readonly opacity: number;
}

// ─── Effects ─────────────────────────────────────────────────────────────────

export type EffectType = 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';

export interface Effect {
  readonly type: EffectType;
  readonly visible: boolean;
  readonly radius: number;
  readonly color?: Color;
  readonly offset?: Vector2D;
  readonly spread?: number;
}

// ─── Text ────────────────────────────────────────────────────────────────────

export type TextAlignHorizontal = 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
export type TextAlignVertical = 'TOP' | 'CENTER' | 'BOTTOM';
export type TextDecoration = 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
export type TextCase = 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';

export interface TextStyle {
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontSize: number;
  readonly lineHeight: number | 'AUTO';
  readonly letterSpacing: number;
  readonly textAlignHorizontal: TextAlignHorizontal;
  readonly textAlignVertical: TextAlignVertical;
  readonly textDecoration: TextDecoration;
  readonly textCase: TextCase;
  readonly color: Color;
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL';
export type LayoutAlign = 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT';
export type LayoutWrap = 'NO_WRAP' | 'WRAP';

export type ConstraintType = 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE';

export interface Constraints {
  readonly horizontal: ConstraintType;
  readonly vertical: ConstraintType;
}

export interface AutoLayoutProperties {
  readonly mode: LayoutMode;
  readonly primaryAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  readonly counterAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  readonly paddingTop: number;
  readonly paddingRight: number;
  readonly paddingBottom: number;
  readonly paddingLeft: number;
  readonly itemSpacing: number;
  readonly counterAxisSpacing: number;
  readonly layoutWrap: LayoutWrap;
}
