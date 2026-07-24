import { FrameSpec, Rect } from "../shared/types";
import { buildEasing, EasingCurve } from "./easing";

export interface LoadedLayer {
  key: string;
  rect: Rect; // frame units
  opacity: number;
  image: HTMLImageElement;
}

export interface LoadedFrame {
  spec: FrameSpec;
  /** Background-only when spec.hasBaseImage, otherwise the full frame. */
  image: HTMLImageElement;
  layers: LoadedLayer[] | null;
}

export interface Scene {
  frames: LoadedFrame[];
  loopToIndex: number | null;
  /** Canvas size in frame units; frames smaller than this get centred. */
  width: number;
  height: number;
}

export interface RenderOptions {
  scene: Scene;
  ctx: CanvasRenderingContext2D;
  /** Canvas pixels per frame unit. */
  scale: number;
  fps: number;
  emit: () => void | Promise<void>;
  onProgress?: (frameIndex: number, total: number) => void;
  signal: AbortSignal;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
  };
}

/** Offset that centres a frame inside the scene canvas, in frame units. */
function frameOffset(scene: Scene, frame: LoadedFrame): { x: number; y: number } {
  return {
    x: (scene.width - frame.spec.width) / 2,
    y: (scene.height - frame.spec.height) / 2,
  };
}

function overlayOffset(scene: Scene, frame: LoadedFrame): { x: number; y: number } {
  const base = frameOffset(scene, frame);
  const pos = frame.spec.overlayPosition;
  return pos ? { x: base.x + pos.x, y: base.y + pos.y } : base;
}

interface DrawState {
  ctx: CanvasRenderingContext2D;
  scale: number;
  scene: Scene;
}

/** Draws one frame (background plus any decomposed layers) at an offset. */
function drawFrame(
  state: DrawState,
  frame: LoadedFrame,
  dx: number,
  dy: number,
  alpha: number
): void {
  const { ctx, scale, scene } = state;
  const offset = frame.spec.isOverlay
    ? overlayOffset(scene, frame)
    : frameOffset(scene, frame);
  const x = (offset.x + dx) * scale;
  const y = (offset.y + dy) * scale;

  ctx.globalAlpha = alpha;
  ctx.drawImage(frame.image, x, y, frame.spec.width * scale, frame.spec.height * scale);

  if (frame.layers) {
    for (const layer of frame.layers) {
      ctx.globalAlpha = alpha * layer.opacity;
      ctx.drawImage(
        layer.image,
        x + layer.rect.x * scale,
        y + layer.rect.y * scale,
        layer.rect.w * scale,
        layer.rect.h * scale
      );
    }
  }

  ctx.globalAlpha = 1;
}

/**
 * Smart Animate: layers present in both frames morph between their rects while
 * their contents cross-fade; layers on only one side fade in or out in place.
 */
function drawSmartAnimate(
  state: DrawState,
  from: LoadedFrame,
  to: LoadedFrame,
  t: number
): void {
  const { ctx, scale, scene } = state;

  const fromOffset = frameOffset(scene, from);
  const toOffset = frameOffset(scene, to);
  const offsetX = lerp(fromOffset.x, toOffset.x, t) * scale;
  const offsetY = lerp(fromOffset.y, toOffset.y, t) * scale;

  // Backgrounds cross-fade underneath everything else.
  ctx.globalAlpha = 1;
  ctx.drawImage(
    from.image,
    fromOffset.x * scale,
    fromOffset.y * scale,
    from.spec.width * scale,
    from.spec.height * scale
  );
  ctx.globalAlpha = t;
  ctx.drawImage(
    to.image,
    toOffset.x * scale,
    toOffset.y * scale,
    to.spec.width * scale,
    to.spec.height * scale
  );
  ctx.globalAlpha = 1;

  const fromLayers = from.layers || [];
  const toLayers = to.layers || [];
  const toByKey = new Map(toLayers.map((l) => [l.key, l]));
  const matchedKeys = new Set<string>();

  for (const layer of fromLayers) {
    const match = toByKey.get(layer.key);

    if (!match) {
      // Leaves the scene: hold position, fade out.
      ctx.globalAlpha = layer.opacity * (1 - t);
      drawLayer(ctx, layer.image, layer.rect, offsetX, offsetY, scale);
      continue;
    }

    matchedKeys.add(layer.key);
    const rect = lerpRect(layer.rect, match.rect, t);
    const opacity = lerp(layer.opacity, match.opacity, t);

    ctx.globalAlpha = opacity * (1 - t);
    drawLayer(ctx, layer.image, rect, offsetX, offsetY, scale);
    ctx.globalAlpha = opacity * t;
    drawLayer(ctx, match.image, rect, offsetX, offsetY, scale);
  }

  for (const layer of toLayers) {
    if (matchedKeys.has(layer.key)) continue;
    // Enters the scene: fade in at its destination.
    ctx.globalAlpha = layer.opacity * t;
    drawLayer(ctx, layer.image, layer.rect, offsetX, offsetY, scale);
  }

  ctx.globalAlpha = 1;
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  ctx.drawImage(
    image,
    offsetX + rect.x * scale,
    offsetY + rect.y * scale,
    rect.w * scale,
    rect.h * scale
  );
}

/** Motion along `direction`, expressed as a unit vector in frame units. */
function directionVector(direction: string): { x: number; y: number } {
  switch (direction) {
    case "RIGHT": return { x: 1, y: 0 };
    case "TOP": return { x: 0, y: -1 };
    case "BOTTOM": return { x: 0, y: 1 };
    case "LEFT":
    default: return { x: -1, y: 0 };
  }
}

function drawTransitionFrame(
  state: DrawState,
  from: LoadedFrame,
  to: LoadedFrame,
  t: number
): void {
  const { scene } = state;
  const transition = from.spec.transition;

  // An overlay keeps whatever is underneath it on screen.
  if (to.spec.isOverlay) {
    drawFrame(state, from, 0, 0, 1);
    const type = transition?.type || "DISSOLVE";
    if (type === "DISSOLVE" || type === "SMART_ANIMATE" || type === "SCROLL_ANIMATE") {
      drawFrame(state, to, 0, 0, t);
    } else {
      const dir = directionVector(transition!.direction);
      const travelX = dir.x * scene.width * (1 - t);
      const travelY = dir.y * scene.height * (1 - t);
      drawFrame(state, to, -travelX, -travelY, 1);
    }
    return;
  }

  if (!transition) {
    drawFrame(state, t < 1 ? from : to, 0, 0, 1);
    return;
  }

  switch (transition.type) {
    case "SMART_ANIMATE":
    case "SCROLL_ANIMATE":
      if (from.layers || to.layers) {
        drawSmartAnimate(state, from, to, t);
      } else {
        drawFrame(state, from, 0, 0, 1);
        drawFrame(state, to, 0, 0, t);
      }
      break;

    case "MOVE_IN": {
      const dir = directionVector(transition.direction);
      drawFrame(state, from, 0, 0, 1);
      drawFrame(state, to, -dir.x * scene.width * (1 - t), -dir.y * scene.height * (1 - t), 1);
      break;
    }

    case "MOVE_OUT": {
      const dir = directionVector(transition.direction);
      drawFrame(state, to, 0, 0, 1);
      drawFrame(state, from, dir.x * scene.width * t, dir.y * scene.height * t, 1);
      break;
    }

    case "PUSH": {
      const dir = directionVector(transition.direction);
      drawFrame(state, from, dir.x * scene.width * t, dir.y * scene.height * t, 1);
      drawFrame(state, to, -dir.x * scene.width * (1 - t), -dir.y * scene.height * (1 - t), 1);
      break;
    }

    case "SLIDE_IN": {
      // Like MOVE_IN, but the frame underneath drifts along for parallax.
      const dir = directionVector(transition.direction);
      drawFrame(state, from, dir.x * scene.width * t * 0.25, dir.y * scene.height * t * 0.25, 1);
      drawFrame(state, to, -dir.x * scene.width * (1 - t), -dir.y * scene.height * (1 - t), 1);
      break;
    }

    case "SLIDE_OUT": {
      const dir = directionVector(transition.direction);
      drawFrame(state, to, -dir.x * scene.width * (1 - t) * 0.25, -dir.y * scene.height * (1 - t) * 0.25, 1);
      drawFrame(state, from, dir.x * scene.width * t, dir.y * scene.height * t, 1);
      break;
    }

    case "DISSOLVE":
    default:
      drawFrame(state, from, 0, 0, 1);
      drawFrame(state, to, 0, 0, t);
      break;
  }
}

interface Step {
  frame: LoadedFrame;
  next: LoadedFrame | null;
  curve: EasingCurve | null;
  holdFrames: number;
  transitionFrames: number;
}

function planSteps(scene: Scene, fps: number): Step[] {
  const steps: Step[] = [];
  const { frames, loopToIndex } = scene;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const isLast = i === frames.length - 1;
    const next = isLast
      ? loopToIndex != null
        ? frames[loopToIndex]
        : null
      : frames[i + 1];

    const transition = frame.spec.transition;
    const curve = transition ? buildEasing(transition.easing) : null;

    let transitionFrames = 0;
    if (next && transition) {
      // Spring curves run for as long as they need; Figma ignores the slider.
      const seconds = curve?.naturalDuration ?? transition.duration;
      transitionFrames = Math.max(Math.round(seconds * fps), 1);
    }

    steps.push({
      frame,
      next,
      curve,
      holdFrames: Math.max(Math.round((frame.spec.holdDuration / 1000) * fps), 1),
      transitionFrames,
    });
  }

  return steps;
}

export function countOutputFrames(scene: Scene, fps: number): number {
  return planSteps(scene, fps).reduce(
    (total, step) => total + step.holdFrames + step.transitionFrames,
    0
  );
}

export async function renderSequence(options: RenderOptions): Promise<void> {
  const { scene, ctx, scale, fps, emit, onProgress, signal } = options;
  const state: DrawState = { ctx, scale, scene };
  const steps = planSteps(scene, fps);

  const canvasW = scene.width * scale;
  const canvasH = scene.height * scale;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (signal.aborted) return;
    if (onProgress) onProgress(i, steps.length);

    for (let f = 0; f < step.holdFrames; f++) {
      if (signal.aborted) return;
      ctx.clearRect(0, 0, canvasW, canvasH);
      drawFrame(state, step.frame, 0, 0, 1);
      await emit();
    }

    if (!step.next || step.transitionFrames === 0) continue;

    for (let f = 1; f <= step.transitionFrames; f++) {
      if (signal.aborted) return;
      const raw = f / step.transitionFrames;
      const t = step.curve ? step.curve.at(raw) : raw;
      ctx.clearRect(0, 0, canvasW, canvasH);
      drawTransitionFrame(state, step.frame, step.next, t);
      await emit();
    }
  }
}
