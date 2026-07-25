/**
 * Extracts AnimatableStyle from PrototypeNode data.
 *
 * This module works with already-parsed PrototypeNodes (not raw Figma
 * nodes) — the API layer handles the Figma → ProtoMotion type conversion.
 * The style extractor's job is to normalize and fill in defaults for
 * properties that may be missing or partially defined.
 */

import type { AnimatableStyle } from '@/types/prototype';
import type { Paint, Stroke, Effect, CornerRadius, Color } from '@/types/primitives';

const DEFAULT_CORNER_RADIUS: CornerRadius = {
  topLeft: 0,
  topRight: 0,
  bottomRight: 0,
  bottomLeft: 0,
};

const TRANSPARENT: Color = { r: 0, g: 0, b: 0, a: 0 };

export function normalizeStyle(style: AnimatableStyle): AnimatableStyle {
  return {
    position: style.position,
    size: style.size,
    rotation: style.rotation ?? 0,
    opacity: clampUnit(style.opacity ?? 1),
    cornerRadius: style.cornerRadius ?? DEFAULT_CORNER_RADIUS,
    fills: normalizePaints(style.fills),
    strokes: normalizeStrokes(style.strokes),
    effects: normalizeEffects(style.effects),
    clipContent: style.clipContent ?? false,
    visible: style.visible ?? true,
    blendMode: style.blendMode ?? 'PASS_THROUGH',
  };
}

export function getFirstSolidFillColor(style: AnimatableStyle): Color {
  for (const fill of style.fills) {
    if (fill.type === 'SOLID' && fill.visible && fill.color) {
      return fill.color;
    }
  }
  return TRANSPARENT;
}

export function getFirstStrokeColor(style: AnimatableStyle): Color {
  for (const stroke of style.strokes) {
    if (stroke.visible) {
      return stroke.color;
    }
  }
  return TRANSPARENT;
}

export function getFirstShadow(style: AnimatableStyle): Effect | null {
  for (const effect of style.effects) {
    if ((effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && effect.visible) {
      return effect;
    }
  }
  return null;
}

export function getFirstBlur(style: AnimatableStyle): Effect | null {
  for (const effect of style.effects) {
    if ((effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') && effect.visible) {
      return effect;
    }
  }
  return null;
}

function normalizePaints(paints: readonly Paint[]): Paint[] {
  return paints.map((p) => ({
    type: p.type,
    visible: p.visible ?? true,
    opacity: clampUnit(p.opacity ?? 1),
    color: p.color,
    gradientStops: p.gradientStops,
    gradientTransform: p.gradientTransform,
    imageHash: p.imageHash,
    scaleMode: p.scaleMode,
  }));
}

function normalizeStrokes(strokes: readonly Stroke[]): Stroke[] {
  return strokes.map((s) => ({
    color: s.color,
    weight: Math.max(0, s.weight ?? 0),
    align: s.align ?? 'CENTER',
    cap: s.cap ?? 'NONE',
    join: s.join ?? 'MITER',
    dashPattern: s.dashPattern ?? [],
    visible: s.visible ?? true,
    opacity: clampUnit(s.opacity ?? 1),
  }));
}

function normalizeEffects(effects: readonly Effect[]): Effect[] {
  return effects.map((e) => ({
    type: e.type,
    visible: e.visible ?? true,
    radius: Math.max(0, e.radius ?? 0),
    color: e.color,
    offset: e.offset ?? { x: 0, y: 0 },
    spread: e.spread ?? 0,
  }));
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
