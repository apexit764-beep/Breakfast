/**
 * Trigger Handler — determines which interactions fire and when.
 *
 * In a real Figma prototype, triggers fire in response to user input.
 * Since we're generating a video, we simulate the user:
 *
 * - AFTER_DELAY triggers fire automatically after their delay
 * - ON_CLICK triggers fire after a configurable hold period
 * - Hover/Press triggers are simulated as instant interactions
 * - KEY_PRESS and GAMEPAD triggers are skipped (no keyboard in video)
 *
 * The handler returns interactions sorted by priority. Automatic
 * triggers (AFTER_DELAY) always take priority over simulated ones.
 */

import type { Interaction, TriggerType } from '@/types/interactions';
import type { PlaybackConfig } from '@/core/config';

export interface ScheduledInteraction {
  readonly interaction: Interaction;
  readonly fireDelay: number; // ms from when the frame is entered
  readonly isAutomatic: boolean;
}

const TRIGGER_PRIORITY: Record<TriggerType, number> = {
  AFTER_DELAY: 0,
  ON_CLICK: 1,
  ON_DRAG: 2,
  WHILE_HOVERING: 3,
  MOUSE_ENTER: 4,
  MOUSE_LEAVE: 5,
  MOUSE_DOWN: 6,
  MOUSE_UP: 7,
  TOUCH_DOWN: 8,
  TOUCH_UP: 9,
  KEY_PRESS: 10,
  GAMEPAD: 11,
};

const SKIPPED_TRIGGERS: ReadonlySet<TriggerType> = new Set([
  'KEY_PRESS',
  'GAMEPAD',
]);

export function scheduleInteractions(
  interactions: readonly Interaction[],
  config: PlaybackConfig,
): ScheduledInteraction[] {
  const scheduled: ScheduledInteraction[] = [];

  for (const interaction of interactions) {
    if (SKIPPED_TRIGGERS.has(interaction.trigger.type)) continue;

    const schedule = resolveSchedule(interaction, config);
    if (schedule) {
      scheduled.push(schedule);
    }
  }

  scheduled.sort((a, b) => {
    if (a.isAutomatic !== b.isAutomatic) {
      return a.isAutomatic ? -1 : 1;
    }
    if (a.fireDelay !== b.fireDelay) {
      return a.fireDelay - b.fireDelay;
    }
    return (
      TRIGGER_PRIORITY[a.interaction.trigger.type] -
      TRIGGER_PRIORITY[b.interaction.trigger.type]
    );
  });

  return scheduled;
}

function resolveSchedule(
  interaction: Interaction,
  config: PlaybackConfig,
): ScheduledInteraction | null {
  const trigger = interaction.trigger;

  switch (trigger.type) {
    case 'AFTER_DELAY':
      return {
        interaction,
        fireDelay: trigger.delay,
        isAutomatic: true,
      };

    case 'ON_CLICK':
    case 'ON_DRAG':
    case 'TOUCH_DOWN':
      return {
        interaction,
        fireDelay: config.autoAdvanceDelay,
        isAutomatic: false,
      };

    case 'WHILE_HOVERING':
    case 'MOUSE_ENTER':
      return {
        interaction,
        fireDelay: config.autoAdvanceDelay,
        isAutomatic: false,
      };

    case 'MOUSE_DOWN':
    case 'MOUSE_UP':
    case 'TOUCH_UP':
    case 'MOUSE_LEAVE':
      return {
        interaction,
        fireDelay: config.autoAdvanceDelay,
        isAutomatic: false,
      };

    default:
      return null;
  }
}

export function getHoldDuration(
  scheduledInteractions: readonly ScheduledInteraction[],
  config: PlaybackConfig,
): number {
  if (scheduledInteractions.length === 0) {
    return config.defaultHoldDuration;
  }

  const first = scheduledInteractions[0];
  if (first.isAutomatic) {
    return first.fireDelay;
  }

  return config.defaultHoldDuration;
}
