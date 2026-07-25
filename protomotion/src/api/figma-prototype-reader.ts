/**
 * IPrototypeReader implementation backed by the Figma Plugin API.
 *
 * Reads prototype-specific data that isn't part of the visual tree:
 * reactions (trigger → action + transition), scroll behaviors,
 * component properties, and variables.
 *
 * This is where Figma's Reaction/Action/Trigger types get mapped to
 * ProtoMotion's own interaction types. The mapping handles naming
 * differences between the two type systems:
 *
 *   Figma                → ProtoMotion
 *   ON_HOVER             → WHILE_HOVERING
 *   AFTER_TIMEOUT        → AFTER_DELAY
 *   ON_KEY_DOWN          → KEY_PRESS
 *   ON_PRESS             → MOUSE_DOWN
 *   EASE_IN_AND_OUT      → EASE_IN_OUT
 *   CUSTOM_CUBIC_BEZIER  → CUSTOM_BEZIER
 *   BOUNCE               → BOUNCY
 *   duration (seconds)   → duration (milliseconds)
 */

import type { IPrototypeReader } from './prototype-reader';
import type {
  Interaction,
  Trigger,
  TriggerType,
  Action,
  ActionType,
  Transition,
  TransitionType,
  TransitionDirection,
  EasingDefinition,
  EasingType,
  OverlaySettings,
  OverlayPosition,
} from '@/types/interactions';
import type { ScrollBehavior, ScrollDirection, ComponentProperty, PrototypeVariable } from '@/types/prototype';

export class FigmaPrototypeReader implements IPrototypeReader {
  private interactionCounter = 0;

  readInteractions(nodeId: string): Interaction[] {
    const node = figma.getNodeById(nodeId) as SceneNode;
    if (!node || !('reactions' in node)) return [];

    const reactions = (node as FrameNode).reactions;
    if (!reactions) return [];

    return reactions
      .filter((r) => r.trigger && (r.action || r.actions?.length))
      .map((reaction) => this.convertReaction(reaction));
  }

  readScrollBehavior(nodeId: string): ScrollBehavior | undefined {
    const node = figma.getNodeById(nodeId) as SceneNode;
    if (!node || node.type !== 'FRAME') return undefined;

    const frame = node as FrameNode;
    const direction = this.mapScrollDirection(frame.overflowDirection);
    if (direction === 'NONE') return undefined;

    const children = frame.children;
    const stickyIds: string[] = [];
    for (const child of children) {
      if ('layoutPositioning' in child && (child as FrameNode).layoutPositioning === 'ABSOLUTE') {
        stickyIds.push(child.id);
      }
    }

    let contentWidth = frame.width;
    let contentHeight = frame.height;
    for (const child of children) {
      const right = child.x + child.width;
      const bottom = child.y + child.height;
      if (right > contentWidth) contentWidth = right;
      if (bottom > contentHeight) contentHeight = bottom;
    }

    return {
      direction,
      overflow: 'SCROLLS',
      scrollOffset: { x: 0, y: 0 },
      contentSize: { width: contentWidth, height: contentHeight },
      hasScrollMomentum: true,
      snapToGrid: false,
      stickyChildren: stickyIds,
    };
  }

  readComponentProperties(nodeId: string): Map<string, ComponentProperty> {
    const node = figma.getNodeById(nodeId) as SceneNode;
    const result = new Map<string, ComponentProperty>();

    if (!node) return result;

    if (node.type === 'INSTANCE') {
      const instance = node as InstanceNode;
      const props = instance.componentProperties;
      if (props) {
        for (const [key, prop] of Object.entries(props)) {
          result.set(key, {
            name: key,
            type: this.mapComponentPropertyType(prop.type),
            value: prop.value as string | boolean,
            defaultValue: prop.value as string | boolean,
          });
        }
      }
    }

    if (node.type === 'COMPONENT_SET') {
      const componentSet = node as ComponentSetNode;
      const props = componentSet.componentPropertyDefinitions;
      if (props) {
        for (const [key, def] of Object.entries(props)) {
          result.set(key, {
            name: key,
            type: this.mapComponentPropertyType(def.type),
            value: def.defaultValue as string | boolean,
            defaultValue: def.defaultValue as string | boolean,
            variantOptions: def.variantOptions,
          });
        }
      }
    }

    return result;
  }

  readVariables(): PrototypeVariable[] {
    const variables: PrototypeVariable[] = [];
    try {
      const collections = figma.variables.getLocalVariableCollections();
      for (const collection of collections) {
        for (const varId of collection.variableIds) {
          const variable = figma.variables.getVariableById(varId);
          if (!variable) continue;

          const modeId = collection.modes[0]?.modeId;
          if (!modeId) continue;

          const rawValue = variable.valuesByMode[modeId];

          variables.push({
            id: variable.id,
            name: variable.name,
            type: this.mapVariableType(variable.resolvedType),
            defaultValue: this.convertVariableValue(rawValue, variable.resolvedType),
            collectionId: collection.id,
            collectionName: collection.name,
          });
        }
      }
    } catch {
      // Variables API may not be available in all contexts
    }
    return variables;
  }

  getInteractiveNodeIds(): string[] {
    const ids: string[] = [];
    this.walkPage(figma.currentPage, (node) => {
      if ('reactions' in node) {
        const reactions = (node as FrameNode).reactions;
        if (reactions && reactions.length > 0) {
          ids.push(node.id);
        }
      }
    });
    return ids;
  }

  // ─── Private Helpers ─────────────────────────────────────────

  private convertReaction(reaction: Reaction): Interaction {
    const id = `interaction_${++this.interactionCounter}`;
    const trigger = this.convertTrigger(reaction.trigger!);
    const actions = this.convertActions(reaction);

    return { id, trigger, actions };
  }

  private convertTrigger(figmaTrigger: Trigger): Trigger {
    const type = this.mapTriggerType(figmaTrigger.type);

    switch (type) {
      case 'AFTER_DELAY':
        return {
          type: 'AFTER_DELAY',
          delay: ('timeout' in figmaTrigger ? (figmaTrigger as { timeout: number }).timeout : 0) * 1000,
        };
      case 'KEY_PRESS':
        return {
          type: 'KEY_PRESS',
          keyCodes: 'keyCodes' in figmaTrigger ? (figmaTrigger as { keyCodes: number[] }).keyCodes : [],
        };
      case 'WHILE_HOVERING':
      case 'MOUSE_ENTER':
      case 'MOUSE_LEAVE':
        return { type } as import('@/types/interactions').HoverTrigger;
      case 'MOUSE_DOWN':
      case 'MOUSE_UP':
      case 'TOUCH_DOWN':
      case 'TOUCH_UP':
        return { type } as import('@/types/interactions').PressTrigger;
      case 'ON_CLICK':
        return { type: 'ON_CLICK' };
      case 'ON_DRAG':
        return { type: 'ON_DRAG' };
      case 'GAMEPAD':
        return { type: 'GAMEPAD' };
      default:
        return { type: 'ON_CLICK' };
    }
  }

  private convertActions(reaction: Reaction): Action[] {
    const figmaActions = reaction.actions ?? (reaction.action ? [reaction.action] : []);
    return figmaActions
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .map((a) => this.convertAction(a));
  }

  private convertAction(figmaAction: Action): import('@/types/interactions').Action {
    const transition = figmaAction.transition
      ? this.convertTransition(figmaAction.transition)
      : undefined;

    switch (figmaAction.type) {
      case 'BACK':
        return { type: 'BACK', transition };

      case 'CLOSE':
        return { type: 'CLOSE_OVERLAY', transition };

      case 'URL':
        return {
          type: 'OPEN_LINK',
          url: (figmaAction as { url: string }).url ?? '',
          transition,
        };

      case 'SET_VARIABLE':
        return {
          type: 'SET_VARIABLE',
          assignment: {
            variableId: '',
            value: '',
          },
          transition,
        };

      case 'CONDITIONAL':
        return {
          type: 'CONDITIONAL',
          branches: [],
          transition,
        };

      case 'NODE': {
        const nav = figmaAction.navigation;
        const destinationId = figmaAction.destinationId ?? '';

        if (nav === 'OVERLAY') {
          return {
            type: 'OPEN_OVERLAY',
            destinationId,
            overlaySettings: this.extractOverlaySettings(figmaAction),
            transition,
          };
        }
        if (nav === 'SWAP') {
          return {
            type: 'SWAP_OVERLAY',
            destinationId,
            overlaySettings: this.extractOverlaySettings(figmaAction),
            transition,
          };
        }
        if (nav === 'SCROLL_TO') {
          return {
            type: 'SCROLL_TO',
            scrollTarget: { nodeId: destinationId, offset: { x: 0, y: 0 } },
            transition,
          };
        }
        if (nav === 'CHANGE_TO') {
          return {
            type: 'CHANGE_TO',
            destinationId,
            transition,
          };
        }
        return {
          type: 'NAVIGATE',
          destinationId,
          transition,
        };
      }

      default:
        return {
          type: 'NAVIGATE',
          destinationId: figmaAction.destinationId ?? '',
          transition,
        };
    }
  }

  private convertTransition(t: Transition): import('@/types/interactions').Transition {
    return {
      type: this.mapTransitionType(t.type),
      duration: t.duration * 1000,
      easing: this.convertEasing(t.easing),
      direction: ('direction' in t && t.direction)
        ? t.direction as TransitionDirection
        : undefined,
    };
  }

  private convertEasing(easing: Easing): EasingDefinition {
    const type = this.mapEasingType(easing.type);

    if (type === 'CUSTOM_BEZIER' && 'easingFunctionCubicBezier' in easing) {
      const cb = easing.easingFunctionCubicBezier;
      return {
        type: 'CUSTOM_BEZIER',
        bezier: [cb.x1, cb.y1, cb.x2, cb.y2],
      };
    }

    if (type === 'CUSTOM_SPRING' && 'easingFunctionSpring' in easing) {
      const sp = easing.easingFunctionSpring;
      return {
        type: 'CUSTOM_SPRING',
        spring: { mass: sp.mass, stiffness: sp.stiffness, damping: sp.damping },
      };
    }

    return { type };
  }

  private extractOverlaySettings(action: Action): OverlaySettings {
    const relPos = action.overlayRelativePosition ?? { x: 0, y: 0 };
    return {
      position: 'CENTER' as OverlayPosition,
      offset: { x: relPos.x, y: relPos.y },
      backgroundInteraction: 'CLOSE_ON_CLICK_OUTSIDE',
    };
  }

  private mapTriggerType(figmaType: string): TriggerType {
    const MAP: Record<string, TriggerType> = {
      ON_CLICK: 'ON_CLICK',
      ON_DRAG: 'ON_DRAG',
      ON_HOVER: 'WHILE_HOVERING',
      WHILE_HOVERING: 'WHILE_HOVERING',
      MOUSE_ENTER: 'MOUSE_ENTER',
      MOUSE_LEAVE: 'MOUSE_LEAVE',
      MOUSE_DOWN: 'MOUSE_DOWN',
      MOUSE_UP: 'MOUSE_UP',
      ON_PRESS: 'MOUSE_DOWN',
      TOUCH_DOWN: 'TOUCH_DOWN',
      TOUCH_UP: 'TOUCH_UP',
      ON_KEY_DOWN: 'KEY_PRESS',
      KEY_DOWN: 'KEY_PRESS',
      GAMEPAD: 'GAMEPAD',
      AFTER_TIMEOUT: 'AFTER_DELAY',
    };
    return MAP[figmaType] ?? 'ON_CLICK';
  }

  private mapTransitionType(figmaType: string): TransitionType {
    const MAP: Record<string, TransitionType> = {
      DISSOLVE: 'DISSOLVE',
      SMART_ANIMATE: 'SMART_ANIMATE',
      MOVE_IN: 'MOVE_IN',
      MOVE_OUT: 'MOVE_OUT',
      PUSH: 'PUSH',
      SLIDE_IN: 'SLIDE_IN',
      SLIDE_OUT: 'SLIDE_OUT',
    };
    return MAP[figmaType] ?? 'INSTANT';
  }

  private mapEasingType(figmaType: string): EasingType {
    const MAP: Record<string, EasingType> = {
      LINEAR: 'LINEAR',
      EASE_IN: 'EASE_IN',
      EASE_OUT: 'EASE_OUT',
      EASE_IN_AND_OUT: 'EASE_IN_OUT',
      EASE_IN_BACK: 'EASE_IN_BACK',
      EASE_OUT_BACK: 'EASE_OUT_BACK',
      EASE_IN_AND_OUT_BACK: 'EASE_IN_OUT_BACK',
      CUSTOM_CUBIC_BEZIER: 'CUSTOM_BEZIER',
      CUSTOM_SPRING: 'CUSTOM_SPRING',
      GENTLE: 'GENTLE',
      QUICK: 'QUICK',
      SLOW: 'SLOW',
      BOUNCE: 'BOUNCY',
      BOUNCY: 'BOUNCY',
    };
    return MAP[figmaType] ?? 'LINEAR';
  }

  private mapScrollDirection(overflow: string): ScrollDirection {
    switch (overflow) {
      case 'VERTICAL_SCROLLING': return 'VERTICAL';
      case 'HORIZONTAL_SCROLLING': return 'HORIZONTAL';
      case 'HORIZONTAL_AND_VERTICAL_SCROLLING': return 'BOTH';
      default: return 'NONE';
    }
  }

  private mapComponentPropertyType(
    type: string,
  ): import('@/types/prototype').ComponentPropertyType {
    const MAP: Record<string, import('@/types/prototype').ComponentPropertyType> = {
      BOOLEAN: 'BOOLEAN',
      TEXT: 'TEXT',
      INSTANCE_SWAP: 'INSTANCE_SWAP',
      VARIANT: 'VARIANT',
    };
    return MAP[type] ?? 'TEXT';
  }

  private mapVariableType(
    resolvedType: string,
  ): import('@/types/prototype').VariableType {
    const MAP: Record<string, import('@/types/prototype').VariableType> = {
      BOOLEAN: 'BOOLEAN',
      FLOAT: 'FLOAT',
      STRING: 'STRING',
      COLOR: 'COLOR',
    };
    return MAP[resolvedType] ?? 'STRING';
  }

  private convertVariableValue(
    raw: unknown,
    resolvedType: string,
  ): string | number | boolean | import('@/types/primitives').Color {
    if (resolvedType === 'COLOR' && raw && typeof raw === 'object' && 'r' in raw) {
      const c = raw as { r: number; g: number; b: number; a: number };
      return { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 };
    }
    if (resolvedType === 'BOOLEAN') return Boolean(raw);
    if (resolvedType === 'FLOAT') return Number(raw);
    return String(raw);
  }

  private walkPage(page: PageNode, callback: (node: SceneNode) => void): void {
    const walk = (node: SceneNode): void => {
      callback(node);
      if ('children' in node) {
        for (const child of (node as FrameNode).children) {
          walk(child);
        }
      }
    };
    for (const child of page.children) {
      walk(child as SceneNode);
    }
  }
}
