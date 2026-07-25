/**
 * Extracts and normalizes transition metadata from interactions.
 *
 * Handles edge cases: zero-duration smart-animate becomes instant,
 * negative durations are clamped, missing easing defaults to linear.
 */

import type { Transition, EasingDefinition } from '@/types/interactions';

const DEFAULT_EASING: EasingDefinition = { type: 'EASE_IN_OUT' };
const DEFAULT_DURATION = 300; // ms

export function normalizeTransition(transition: Transition | undefined): Transition {
  if (!transition) {
    return {
      type: 'INSTANT',
      duration: 0,
      easing: { type: 'LINEAR' },
    };
  }

  const duration = Math.max(0, transition.duration);

  if (transition.type === 'SMART_ANIMATE' && duration === 0) {
    return {
      type: 'INSTANT',
      duration: 0,
      easing: { type: 'LINEAR' },
    };
  }

  return {
    type: transition.type,
    duration,
    easing: transition.easing ?? DEFAULT_EASING,
    direction: transition.direction,
    matchLayers: transition.matchLayers,
  };
}

export function getEffectiveDuration(transition: Transition | undefined): number {
  if (!transition || transition.type === 'INSTANT') return 0;
  return Math.max(0, transition.duration ?? DEFAULT_DURATION);
}

export function isAnimatedTransition(transition: Transition | undefined): boolean {
  if (!transition) return false;
  return transition.type !== 'INSTANT' && transition.duration > 0;
}
