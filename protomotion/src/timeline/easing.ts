/**
 * Easing functions matching Figma's prototype transition curves.
 *
 * Each function takes a normalized time t (0–1) and returns a normalized
 * progress value (0–1). The output may exceed [0,1] for overshoot
 * curves (back, spring, bounce).
 *
 * Figma's named easings map to specific cubic-bezier curves. These values
 * were derived from Figma's own documentation and behavioral testing.
 */

import type { EasingDefinition, SpringConfig } from '@/types/interactions';

export type EasingFunction = (t: number) => number;

const FIGMA_BEZIER_PRESETS: Record<string, readonly [number, number, number, number]> = {
  LINEAR:           [0,    0,    1,    1   ],
  EASE_IN:          [0.42, 0,    1,    1   ],
  EASE_OUT:         [0,    0,    0.58, 1   ],
  EASE_IN_OUT:      [0.42, 0,    0.58, 1   ],
  EASE_IN_BACK:     [0.36, 0,    0.66, -0.56],
  EASE_OUT_BACK:    [0.34, 1.56, 0.64, 1   ],
  EASE_IN_OUT_BACK: [0.68, -0.6, 0.32, 1.6 ],
  GENTLE:           [0.4,  0,    0.2,  1   ],
  QUICK:            [0.11, 0,    0.5,  0   ],
  SLOW:             [0.5,  0,    0.15, 1   ],
  BOUNCY:           [0.68, -0.55,0.27, 1.55],
};

export function getEasingFunction(definition: EasingDefinition): EasingFunction {
  if (definition.type === 'CUSTOM_BEZIER' && definition.bezier) {
    return cubicBezier(...definition.bezier);
  }

  if (definition.type === 'CUSTOM_SPRING' && definition.spring) {
    return springEasing(definition.spring);
  }

  const preset = FIGMA_BEZIER_PRESETS[definition.type];
  if (preset) {
    return cubicBezier(...preset);
  }

  return linear;
}

function linear(t: number): number {
  return t;
}

/**
 * Attempt a cubic-bezier curve where x(t) is monotonic.
 * Uses Newton-Raphson to invert x(t) → t, then evaluates y(t).
 */
function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): EasingFunction {
  if (x1 === 0 && y1 === 0 && x2 === 1 && y2 === 1) {
    return linear;
  }

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  function sampleX(t: number): number {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleY(t: number): number {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleXDerivative(t: number): number {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  function solveForT(x: number): number {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const currentX = sampleX(t) - x;
      if (Math.abs(currentX) < 1e-7) return t;
      const derivative = sampleXDerivative(t);
      if (Math.abs(derivative) < 1e-7) break;
      t -= currentX / derivative;
    }

    // Bisection fallback
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const mid = sampleX(t);
      if (Math.abs(mid - x) < 1e-7) return t;
      if (x > mid) {
        lo = t;
      } else {
        hi = t;
      }
      t = (lo + hi) / 2;
    }
    return t;
  }

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveForT(x));
  };
}

/**
 * Attempt damped spring simulation.
 * Simulates the spring once, normalizes the output to [0, ~1].
 */
function springEasing(config: SpringConfig): EasingFunction {
  const { mass, stiffness, damping } = config;

  const STEPS = 300;
  const DURATION = 2.0; // seconds (simulated); the actual timeline duration is set externally
  const dt = DURATION / STEPS;
  const samples: number[] = [0];

  let position = 0;
  let velocity = 1; // initial velocity toward target

  for (let i = 1; i <= STEPS; i++) {
    const springForce = -stiffness * (position - 1);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;
    velocity += acceleration * dt;
    position += velocity * dt;
    samples.push(position);
  }

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return samples[STEPS];
    const index = t * STEPS;
    const lower = Math.floor(index);
    const upper = Math.min(lower + 1, STEPS);
    const frac = index - lower;
    return samples[lower] + (samples[upper] - samples[lower]) * frac;
  };
}

export function getEasingName(definition: EasingDefinition): string {
  if (definition.type === 'CUSTOM_BEZIER' && definition.bezier) {
    return `cubic-bezier(${definition.bezier.join(', ')})`;
  }
  if (definition.type === 'CUSTOM_SPRING' && definition.spring) {
    const { mass, stiffness, damping } = definition.spring;
    return `spring(${mass}, ${stiffness}, ${damping})`;
  }
  return definition.type.toLowerCase().replace(/_/g, '-');
}
