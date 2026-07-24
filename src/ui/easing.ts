import { EasingSpec, SpringParams } from "../shared/types";

/** Figma's named curves, expressed as the cubic-bezier control points it uses. */
const NAMED_BEZIERS: Record<string, [number, number, number, number]> = {
  LINEAR: [0, 0, 1, 1],
  EASE_IN: [0.41, 0, 1, 1],
  EASE_OUT: [0, 0, 0.59, 1],
  EASE_IN_AND_OUT: [0.41, 0, 0.59, 1],
  EASE_IN_BACK: [0.3, -0.05, 0.7, -0.5],
  EASE_OUT_BACK: [0.45, 1.45, 0.8, 1],
  EASE_IN_AND_OUT_BACK: [0.7, -0.4, 0.4, 1.4],
};

function bezierComponent(t: number, a1: number, a2: number): number {
  const c = 3 * a1;
  const b = 3 * (a2 - a1) - c;
  const a = 1 - c - b;
  return ((a * t + b) * t + c) * t;
}

function bezierSlope(t: number, a1: number, a2: number): number {
  const c = 3 * a1;
  const b = 3 * (a2 - a1) - c;
  const a = 1 - c - b;
  return (3 * a * t + 2 * b) * t + c;
}

/** Solves x(t) = target for t, then returns y(t). */
function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (t: number) => number {
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    let t = x;
    for (let i = 0; i < 8; i++) {
      const currentX = bezierComponent(t, x1, x2) - x;
      if (Math.abs(currentX) < 1e-6) return bezierComponent(t, y1, y2);
      const slope = bezierSlope(t, x1, x2);
      if (Math.abs(slope) < 1e-6) break;
      t -= currentX / slope;
    }

    // Newton stalled — fall back to bisection.
    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const currentX = bezierComponent(t, x1, x2);
      if (Math.abs(currentX - x) < 1e-6) break;
      if (currentX < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }

    return bezierComponent(t, y1, y2);
  };
}

/**
 * Integrates a damped harmonic oscillator settling from 0 to 1, which is how
 * Figma's spring curves (GENTLE / QUICK / BOUNCY / SLOW / custom) behave.
 */
function sanitise(value: number, fallback: number, min: number): number {
  return Number.isFinite(value) && value >= min ? value : fallback;
}

const MAX_SPRING_SECONDS = 20;
const MAX_SPRING_SAMPLES = 100_000;

function springSolver(
  params: SpringParams
): { at: (seconds: number) => number; settleTime: number } | null {
  const mass = sanitise(params.mass, 1, 0.05);
  const stiffness = sanitise(params.stiffness, 100, 0.01);
  const damping = sanitise(params.damping, 10, 0);
  const initialVelocity = Number.isFinite(params.initialVelocity)
    ? params.initialVelocity
    : 0;

  // Explicit integration is only stable while the step stays well below the
  // oscillation period, so scale it to the spring's natural frequency.
  const omega = Math.sqrt(stiffness / mass);
  const step = Math.min(1 / 240, 0.05 / Math.max(omega, 1e-6));
  const maxIterations = Math.min(
    Math.ceil(MAX_SPRING_SECONDS / step),
    MAX_SPRING_SAMPLES
  );

  const samples: number[] = [];
  let position = 0;
  let velocity = initialVelocity;
  let settleTime = 0;
  let restFor = 0;

  for (let i = 0; i < maxIterations; i++) {
    const acceleration =
      (-stiffness * (position - 1) - damping * velocity) / mass;

    velocity += acceleration * step;
    position += velocity * step;

    if (!Number.isFinite(position) || !Number.isFinite(velocity)) return null;
    samples.push(position);

    const atRest = Math.abs(1 - position) < 0.001 && Math.abs(velocity) < 0.001;
    restFor = atRest ? restFor + step : 0;
    if (restFor >= 0.05) {
      settleTime = (i + 1) * step;
      break;
    }
  }

  if (samples.length === 0) return null;
  if (settleTime === 0) settleTime = samples.length * step;

  return {
    at: (seconds: number) => {
      if (seconds <= 0) return 0;
      const index = Math.floor(seconds / step);
      if (index >= samples.length) return 1;
      return samples[index];
    },
    settleTime,
  };
}

export interface EasingCurve {
  /** Progress 0..1 for a normalised time 0..1. May overshoot past 1. */
  at: (t: number) => number;
  /** Natural duration in seconds for springs, or null to use Figma's value. */
  naturalDuration: number | null;
}

export function buildEasing(easing: EasingSpec | undefined): EasingCurve {
  if (!easing) {
    const [x1, y1, x2, y2] = NAMED_BEZIERS.EASE_IN_AND_OUT;
    return { at: cubicBezier(x1, y1, x2, y2), naturalDuration: null };
  }

  if (easing.spring) {
    const solver = springSolver(easing.spring);
    if (solver) {
      return {
        at: (t: number) => solver.at(t * solver.settleTime),
        naturalDuration: solver.settleTime,
      };
    }
    // Unstable parameters — fall through to a standard curve.
  }

  if (easing.type === "CUSTOM_CUBIC_BEZIER" && easing.bezier) {
    const b = easing.bezier;
    return { at: cubicBezier(b.x1, b.y1, b.x2, b.y2), naturalDuration: null };
  }

  const named = NAMED_BEZIERS[easing.type] || NAMED_BEZIERS.EASE_IN_AND_OUT;
  return {
    at: cubicBezier(named[0], named[1], named[2], named[3]),
    naturalDuration: null,
  };
}
