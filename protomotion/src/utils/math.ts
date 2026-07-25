import type { Vector2D, Matrix2D } from '@/types/primitives';

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

export function remap(
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  value: number,
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

export function vectorLerp(a: Vector2D, b: Vector2D, t: number): Vector2D {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function vectorAdd(a: Vector2D, b: Vector2D): Vector2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vectorSub(a: Vector2D, b: Vector2D): Vector2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vectorScale(v: Vector2D, s: number): Vector2D {
  return { x: v.x * s, y: v.y * s };
}

export function vectorLength(v: Vector2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vectorNormalize(v: Vector2D): Vector2D {
  const len = vectorLength(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function vectorDistance(a: Vector2D, b: Vector2D): number {
  return vectorLength(vectorSub(b, a));
}

export function identityMatrix(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

export function multiplyMatrices(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return {
    a: m1.a * m2.a + m1.b * m2.c,
    b: m1.a * m2.b + m1.b * m2.d,
    c: m1.c * m2.a + m1.d * m2.c,
    d: m1.c * m2.b + m1.d * m2.d,
    tx: m1.a * m2.tx + m1.b * m2.ty + m1.tx,
    ty: m1.c * m2.tx + m1.d * m2.ty + m1.ty,
  };
}

export function transformPoint(m: Matrix2D, p: Vector2D): Vector2D {
  return {
    x: m.a * p.x + m.b * p.y + m.tx,
    y: m.c * p.x + m.d * p.y + m.ty,
  };
}

export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

export function rotationMatrix(degrees: number): Matrix2D {
  const rad = degreesToRadians(degrees);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: -sin, c: sin, d: cos, tx: 0, ty: 0 };
}

export function translationMatrix(tx: number, ty: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, tx, ty };
}

export function scaleMatrix(sx: number, sy: number): Matrix2D {
  return { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
}
