import type { Color } from '@/types/primitives';
import { clamp, lerp } from './math';

export function colorLerp(a: Color, b: Color, t: number): Color {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
    a: lerp(a.a, b.a, t),
  };
}

export function colorToRGBA(c: Color): [number, number, number, number] {
  return [
    Math.round(clamp(c.r, 0, 1) * 255),
    Math.round(clamp(c.g, 0, 1) * 255),
    Math.round(clamp(c.b, 0, 1) * 255),
    Math.round(clamp(c.a, 0, 1) * 255),
  ];
}

export function rgbaToColor(r: number, g: number, b: number, a: number): Color {
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

export function colorToHex(c: Color): string {
  const [r, g, b, a] = colorToRGBA(c);
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return a === 255 ? `#${hex(r)}${hex(g)}${hex(b)}` : `#${hex(r)}${hex(g)}${hex(b)}${hex(a)}`;
}

export function hexToColor(hex: string): Color {
  const cleaned = hex.replace('#', '');
  const parse = (start: number) => parseInt(cleaned.slice(start, start + 2), 16);
  const r = parse(0);
  const g = parse(2);
  const b = parse(4);
  const a = cleaned.length === 8 ? parse(6) : 255;
  return rgbaToColor(r, g, b, a);
}

export function colorEquals(a: Color, b: Color, epsilon = 1e-6): boolean {
  return (
    Math.abs(a.r - b.r) < epsilon &&
    Math.abs(a.g - b.g) < epsilon &&
    Math.abs(a.b - b.b) < epsilon &&
    Math.abs(a.a - b.a) < epsilon
  );
}

export function premultiplyAlpha(c: Color): Color {
  return { r: c.r * c.a, g: c.g * c.a, b: c.b * c.a, a: c.a };
}

export function unpremultiplyAlpha(c: Color): Color {
  if (c.a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: c.r / c.a, g: c.g / c.a, b: c.b / c.a, a: c.a };
}

export const TRANSPARENT: Color = { r: 0, g: 0, b: 0, a: 0 };
export const WHITE: Color = { r: 1, g: 1, b: 1, a: 1 };
export const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };
