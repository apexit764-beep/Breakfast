import type { Bounds, Size, Vector2D } from '@/types/primitives';

export function boundsContains(bounds: Bounds, point: Vector2D): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function boundsUnion(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

export function boundsCenter(bounds: Bounds): Vector2D {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export function boundsFromSize(size: Size): Bounds {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

export function boundsToSize(bounds: Bounds): Size {
  return { width: bounds.width, height: bounds.height };
}

export function scaleBounds(bounds: Bounds, scale: number): Bounds {
  return {
    x: bounds.x * scale,
    y: bounds.y * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}

export function translateBounds(bounds: Bounds, offset: Vector2D): Bounds {
  return {
    x: bounds.x + offset.x,
    y: bounds.y + offset.y,
    width: bounds.width,
    height: bounds.height,
  };
}

export function fitSize(
  source: Size,
  target: Size,
  mode: 'contain' | 'cover',
): { size: Size; scale: number } {
  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  const scale = mode === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
  return {
    size: { width: source.width * scale, height: source.height * scale },
    scale,
  };
}
