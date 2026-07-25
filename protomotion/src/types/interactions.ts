/**
 * Interaction model: Triggers, Actions, and Transitions.
 *
 * These types map 1:1 with Figma's prototype interaction concepts but are
 * decoupled from the Plugin API types so the rest of the codebase doesn't
 * import @figma/plugin-typings. The parser converts Figma Reaction objects
 * into these types.
 *
 * The type system is designed to be **open for extension**: new trigger types,
 * action types, and transition types can be added by extending the
 * corresponding union. Handlers use a registry pattern (Map<TriggerType, …>)
 * so adding a new variant never requires modifying existing switch statements.
 */

import type { Color, Vector2D } from './primitives';

// ─── Triggers ────────────────────────────────────────────────────────────────

export type TriggerType =
  | 'ON_CLICK'
  | 'ON_DRAG'
  | 'WHILE_HOVERING'
  | 'MOUSE_ENTER'
  | 'MOUSE_LEAVE'
  | 'MOUSE_DOWN'
  | 'MOUSE_UP'
  | 'TOUCH_DOWN'
  | 'TOUCH_UP'
  | 'KEY_PRESS'
  | 'GAMEPAD'
  | 'AFTER_DELAY';

export interface TriggerBase {
  readonly type: TriggerType;
}

export interface ClickTrigger extends TriggerBase {
  readonly type: 'ON_CLICK';
}

export interface DragTrigger extends TriggerBase {
  readonly type: 'ON_DRAG';
}

export interface HoverTrigger extends TriggerBase {
  readonly type: 'WHILE_HOVERING' | 'MOUSE_ENTER' | 'MOUSE_LEAVE';
}

export interface PressTrigger extends TriggerBase {
  readonly type: 'MOUSE_DOWN' | 'MOUSE_UP' | 'TOUCH_DOWN' | 'TOUCH_UP';
}

export interface KeyPressTrigger extends TriggerBase {
  readonly type: 'KEY_PRESS';
  readonly keyCodes: readonly number[];
}

export interface GamepadTrigger extends TriggerBase {
  readonly type: 'GAMEPAD';
}

export interface AfterDelayTrigger extends TriggerBase {
  readonly type: 'AFTER_DELAY';
  readonly delay: number; // ms
}

export type Trigger =
  | ClickTrigger
  | DragTrigger
  | HoverTrigger
  | PressTrigger
  | KeyPressTrigger
  | GamepadTrigger
  | AfterDelayTrigger;

// ─── Transitions ─────────────────────────────────────────────────────────────

export type TransitionType =
  | 'INSTANT'
  | 'DISSOLVE'
  | 'SMART_ANIMATE'
  | 'MOVE_IN'
  | 'MOVE_OUT'
  | 'PUSH'
  | 'SLIDE_IN'
  | 'SLIDE_OUT';

export type TransitionDirection = 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';

export type EasingType =
  | 'LINEAR'
  | 'EASE_IN'
  | 'EASE_OUT'
  | 'EASE_IN_OUT'
  | 'EASE_IN_BACK'
  | 'EASE_OUT_BACK'
  | 'EASE_IN_OUT_BACK'
  | 'CUSTOM_BEZIER'
  | 'CUSTOM_SPRING'
  | 'GENTLE'
  | 'QUICK'
  | 'SLOW'
  | 'BOUNCY';

export interface SpringConfig {
  readonly mass: number;
  readonly stiffness: number;
  readonly damping: number;
}

export interface EasingDefinition {
  readonly type: EasingType;
  readonly bezier?: readonly [number, number, number, number];
  readonly spring?: SpringConfig;
}

export interface Transition {
  readonly type: TransitionType;
  readonly duration: number; // ms
  readonly easing: EasingDefinition;
  readonly direction?: TransitionDirection;
  readonly matchLayers?: boolean;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ActionType =
  | 'NAVIGATE'
  | 'BACK'
  | 'OPEN_OVERLAY'
  | 'CLOSE_OVERLAY'
  | 'SWAP_OVERLAY'
  | 'SCROLL_TO'
  | 'CHANGE_TO'
  | 'SET_VARIABLE'
  | 'OPEN_LINK'
  | 'CONDITIONAL';

export type OverlayPosition =
  | 'CENTER'
  | 'TOP_LEFT'
  | 'TOP_CENTER'
  | 'TOP_RIGHT'
  | 'BOTTOM_LEFT'
  | 'BOTTOM_CENTER'
  | 'BOTTOM_RIGHT'
  | 'MANUAL';

export type OverlayBackgroundInteraction = 'NONE' | 'CLOSE_ON_CLICK_OUTSIDE';

export interface OverlaySettings {
  readonly position: OverlayPosition;
  readonly offset: Vector2D;
  readonly backgroundInteraction: OverlayBackgroundInteraction;
  readonly backgroundDimColor?: Color;
}

export interface ScrollTarget {
  readonly nodeId: string;
  readonly offset: Vector2D;
}

export interface VariableAssignment {
  readonly variableId: string;
  readonly value: string | number | boolean | Color;
}

export interface ConditionalBranch {
  readonly condition: Condition;
  readonly actions: Action[];
}

export interface Condition {
  readonly variableId: string;
  readonly operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';
  readonly value: string | number | boolean;
}

export interface ActionBase {
  readonly type: ActionType;
  readonly transition?: Transition;
}

export interface NavigateAction extends ActionBase {
  readonly type: 'NAVIGATE';
  readonly destinationId: string;
}

export interface BackAction extends ActionBase {
  readonly type: 'BACK';
}

export interface OpenOverlayAction extends ActionBase {
  readonly type: 'OPEN_OVERLAY';
  readonly destinationId: string;
  readonly overlaySettings: OverlaySettings;
}

export interface CloseOverlayAction extends ActionBase {
  readonly type: 'CLOSE_OVERLAY';
}

export interface SwapOverlayAction extends ActionBase {
  readonly type: 'SWAP_OVERLAY';
  readonly destinationId: string;
  readonly overlaySettings: OverlaySettings;
}

export interface ScrollToAction extends ActionBase {
  readonly type: 'SCROLL_TO';
  readonly scrollTarget: ScrollTarget;
}

export interface ChangeToAction extends ActionBase {
  readonly type: 'CHANGE_TO';
  readonly destinationId: string;
}

export interface SetVariableAction extends ActionBase {
  readonly type: 'SET_VARIABLE';
  readonly assignment: VariableAssignment;
}

export interface OpenLinkAction extends ActionBase {
  readonly type: 'OPEN_LINK';
  readonly url: string;
}

export interface ConditionalAction extends ActionBase {
  readonly type: 'CONDITIONAL';
  readonly branches: ConditionalBranch[];
  readonly fallbackActions?: Action[];
}

export type Action =
  | NavigateAction
  | BackAction
  | OpenOverlayAction
  | CloseOverlayAction
  | SwapOverlayAction
  | ScrollToAction
  | ChangeToAction
  | SetVariableAction
  | OpenLinkAction
  | ConditionalAction;

// ─── Interaction (Trigger + Action[]) ────────────────────────────────────────

export interface Interaction {
  readonly id: string;
  readonly trigger: Trigger;
  readonly actions: readonly Action[];
}
