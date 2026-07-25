/**
 * INodeReader implementation backed by the Figma Plugin API.
 *
 * Reads individual node properties and converts them from Figma's
 * SceneNode types into ProtoMotion's PrototypeNode representation.
 * This is the most Figma-API-coupled class in the codebase — it
 * handles every node type and their different property shapes.
 */

import type { INodeReader } from './node-reader';
import type { PrototypeNode, PrototypeNodeType, AnimatableStyle } from '@/types/prototype';
import type { Bounds, CornerRadius, Paint, Stroke, Effect, Color } from '@/types/primitives';

export class FigmaNodeReader implements INodeReader {
  readNode(nodeId: string): PrototypeNode | null {
    const node = figma.getNodeById(nodeId);
    if (!node || !('visible' in node)) return null;
    return this.convertNode(node as SceneNode, null);
  }

  readNodeTree(rootId: string): PrototypeNode {
    const node = figma.getNodeById(rootId) as SceneNode;
    if (!node) {
      throw new Error(`Node ${rootId} not found`);
    }
    return this.convertNode(node, null);
  }

  readStyle(nodeId: string): AnimatableStyle {
    const node = figma.getNodeById(nodeId) as SceneNode;
    if (!node) throw new Error(`Node ${nodeId} not found`);
    return this.extractStyle(node);
  }

  readBounds(nodeId: string): Bounds {
    const node = figma.getNodeById(nodeId) as SceneNode;
    if (!node) throw new Error(`Node ${nodeId} not found`);
    return { x: node.x, y: node.y, width: node.width, height: node.height };
  }

  readAbsoluteBounds(nodeId: string): Bounds {
    const node = figma.getNodeById(nodeId) as SceneNode;
    if (!node || !('absoluteBoundingBox' in node)) {
      throw new Error(`Node ${nodeId} not found or has no absolute bounds`);
    }
    const abs = (node as FrameNode).absoluteBoundingBox;
    if (!abs) return { x: 0, y: 0, width: node.width, height: node.height };
    return { x: abs.x, y: abs.y, width: abs.width, height: abs.height };
  }

  getChildIds(nodeId: string): string[] {
    const node = figma.getNodeById(nodeId);
    if (!node || !('children' in node)) return [];
    return (node as FrameNode).children.map((c) => c.id);
  }

  isVisible(nodeId: string): boolean {
    const node = figma.getNodeById(nodeId) as SceneNode;
    return node ? node.visible : false;
  }

  nodeExists(nodeId: string): boolean {
    return figma.getNodeById(nodeId) !== null;
  }

  private convertNode(node: SceneNode, parentId: string | null): PrototypeNode {
    const children: PrototypeNode[] = [];
    if ('children' in node) {
      for (const child of (node as FrameNode).children) {
        children.push(this.convertNode(child, node.id));
      }
    }

    const isTopLevel =
      node.parent?.type === 'PAGE' &&
      (node.type === 'FRAME' || node.type === 'COMPONENT');

    return {
      id: node.id,
      name: node.name,
      type: this.mapNodeType(node.type),
      bounds: { x: node.x, y: node.y, width: node.width, height: node.height },
      absoluteBounds: this.getAbsoluteBounds(node),
      style: this.extractStyle(node),
      children,
      interactions: [],
      parentId,
      isTopLevelFrame: isTopLevel,
      isMask: 'isMask' in node ? (node as RectangleNode).isMask : false,
      textContent: node.type === 'TEXT' ? (node as TextNode).characters : undefined,
      textStyle: node.type === 'TEXT' ? this.extractTextStyle(node as TextNode) : undefined,
    };
  }

  private extractStyle(node: SceneNode): AnimatableStyle {
    const hasGeometry = 'fills' in node;
    const geomNode = node as GeometryMixin & SceneNode;

    return {
      position: { x: node.x, y: node.y },
      size: { width: node.width, height: node.height },
      rotation: 'rotation' in node ? (node as FrameNode).rotation : 0,
      opacity: 'opacity' in node ? (node as FrameNode).opacity : 1,
      cornerRadius: this.extractCornerRadius(node),
      fills: hasGeometry ? this.convertPaints(geomNode.fills as readonly Paint[]) : [],
      strokes: hasGeometry ? this.convertStrokes(node) : [],
      effects: 'effects' in node ? this.convertEffects((node as FrameNode).effects) : [],
      clipContent: 'clipsContent' in node ? (node as FrameNode).clipsContent : false,
      visible: node.visible,
      blendMode: 'blendMode' in node ? String((node as FrameNode).blendMode) : 'PASS_THROUGH',
    };
  }

  private extractCornerRadius(node: SceneNode): CornerRadius {
    if (!('cornerRadius' in node)) {
      return { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
    }
    const n = node as RectangleNode;
    if (typeof n.cornerRadius === 'number' && n.cornerRadius !== figma.mixed) {
      return {
        topLeft: n.cornerRadius,
        topRight: n.cornerRadius,
        bottomRight: n.cornerRadius,
        bottomLeft: n.cornerRadius,
      };
    }
    return {
      topLeft: n.topLeftRadius ?? 0,
      topRight: n.topRightRadius ?? 0,
      bottomRight: n.bottomRightRadius ?? 0,
      bottomLeft: n.bottomLeftRadius ?? 0,
    };
  }

  private convertPaints(fills: readonly Paint[] | typeof figma.mixed): Paint[] {
    if (fills === figma.mixed || !Array.isArray(fills)) return [];
    return (fills as readonly SolidPaint[]).map((paint) => ({
      type: paint.type as Paint['type'],
      visible: paint.visible ?? true,
      opacity: paint.opacity ?? 1,
      color:
        paint.type === 'SOLID'
          ? { r: paint.color.r, g: paint.color.g, b: paint.color.b, a: paint.opacity ?? 1 }
          : undefined,
      gradientStops:
        'gradientStops' in paint
          ? (paint as GradientPaint).gradientStops.map((s) => ({
              position: s.position,
              color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
            }))
          : undefined,
      imageHash: 'imageHash' in paint ? (paint as ImagePaint).imageHash ?? undefined : undefined,
      scaleMode: 'scaleMode' in paint ? ((paint as ImagePaint).scaleMode as Paint['scaleMode']) : undefined,
    }));
  }

  private convertStrokes(node: SceneNode): Stroke[] {
    if (!('strokes' in node)) return [];
    const n = node as GeometryMixin & MinimalStrokesMixin;
    const paints = n.strokes as readonly SolidPaint[];
    if (!paints || paints === figma.mixed) return [];

    const weight = 'strokeWeight' in n
      ? (typeof n.strokeWeight === 'number' ? n.strokeWeight : 1)
      : 1;

    return paints
      .filter((p) => p.visible !== false)
      .map((paint) => ({
        color:
          paint.type === 'SOLID'
            ? { r: paint.color.r, g: paint.color.g, b: paint.color.b, a: paint.opacity ?? 1 }
            : { r: 0, g: 0, b: 0, a: 1 },
        weight,
        align: ('strokeAlign' in n ? n.strokeAlign : 'CENTER') as Stroke['align'],
        cap: ('strokeCap' in n
          ? (n.strokeCap === figma.mixed ? 'NONE' : n.strokeCap)
          : 'NONE') as Stroke['cap'],
        join: ('strokeJoin' in n
          ? (n.strokeJoin === figma.mixed ? 'MITER' : n.strokeJoin)
          : 'MITER') as Stroke['join'],
        dashPattern: 'dashPattern' in n ? [...n.dashPattern] : [],
        visible: paint.visible ?? true,
        opacity: paint.opacity ?? 1,
      }));
  }

  private convertEffects(effects: readonly Effect[]): Effect[] {
    return effects.map((e) => ({
      type: e.type as Effect['type'],
      visible: e.visible,
      radius: e.radius,
      color: 'color' in e ? this.convertRGBA((e as DropShadowEffect).color) : undefined,
      offset: 'offset' in e ? { x: (e as DropShadowEffect).offset.x, y: (e as DropShadowEffect).offset.y } : undefined,
      spread: 'spread' in e ? (e as DropShadowEffect).spread : undefined,
    }));
  }

  private convertRGBA(c: RGBA): Color {
    return { r: c.r, g: c.g, b: c.b, a: c.a };
  }

  private extractTextStyle(node: TextNode): import('@/types/primitives').TextStyle {
    const fontSize = node.fontSize === figma.mixed ? 14 : node.fontSize;
    const fontWeight = node.fontWeight === figma.mixed ? 400 : node.fontWeight;
    const fontName = node.fontName === figma.mixed
      ? { family: 'Inter', style: 'Regular' }
      : node.fontName;
    const lineHeight = node.lineHeight === figma.mixed
      ? ('AUTO' as const)
      : node.lineHeight.unit === 'AUTO'
        ? ('AUTO' as const)
        : node.lineHeight.value;
    const letterSpacing = node.letterSpacing === figma.mixed ? 0 : node.letterSpacing.value;
    const fills = node.fills === figma.mixed ? [] : (node.fills as SolidPaint[]);
    const firstFill = fills.find((f) => f.type === 'SOLID' && f.visible !== false);

    return {
      fontFamily: fontName.family,
      fontWeight: fontWeight as number,
      fontSize: fontSize as number,
      lineHeight,
      letterSpacing,
      textAlignHorizontal: (node.textAlignHorizontal ?? 'LEFT') as import('@/types/primitives').TextAlignHorizontal,
      textAlignVertical: (node.textAlignVertical ?? 'TOP') as import('@/types/primitives').TextAlignVertical,
      textDecoration: this.mapTextDecoration(node.textDecoration),
      textCase: this.mapTextCase(node.textCase),
      color: firstFill
        ? { r: firstFill.color.r, g: firstFill.color.g, b: firstFill.color.b, a: firstFill.opacity ?? 1 }
        : { r: 0, g: 0, b: 0, a: 1 },
    };
  }

  private mapTextDecoration(
    dec: TextDecoration | typeof figma.mixed,
  ): import('@/types/primitives').TextDecoration {
    if (dec === figma.mixed) return 'NONE';
    switch (dec) {
      case 'UNDERLINE': return 'UNDERLINE';
      case 'STRIKETHROUGH': return 'STRIKETHROUGH';
      default: return 'NONE';
    }
  }

  private mapTextCase(
    tc: TextCase | typeof figma.mixed,
  ): import('@/types/primitives').TextCase {
    if (tc === figma.mixed) return 'ORIGINAL';
    switch (tc) {
      case 'UPPER': return 'UPPER';
      case 'LOWER': return 'LOWER';
      case 'TITLE': return 'TITLE';
      default: return 'ORIGINAL';
    }
  }

  private getAbsoluteBounds(node: SceneNode): Bounds {
    if ('absoluteBoundingBox' in node) {
      const abs = (node as FrameNode).absoluteBoundingBox;
      if (abs) return { x: abs.x, y: abs.y, width: abs.width, height: abs.height };
    }
    return { x: node.x, y: node.y, width: node.width, height: node.height };
  }

  private mapNodeType(figmaType: string): PrototypeNodeType {
    const MAP: Record<string, PrototypeNodeType> = {
      FRAME: 'FRAME',
      GROUP: 'GROUP',
      COMPONENT: 'COMPONENT',
      COMPONENT_SET: 'COMPONENT_SET',
      INSTANCE: 'INSTANCE',
      RECTANGLE: 'RECTANGLE',
      ELLIPSE: 'ELLIPSE',
      POLYGON: 'POLYGON',
      STAR: 'STAR',
      LINE: 'LINE',
      VECTOR: 'VECTOR',
      TEXT: 'TEXT',
      BOOLEAN_OPERATION: 'BOOLEAN_OPERATION',
      SECTION: 'SECTION',
    };
    return MAP[figmaType] ?? 'FRAME';
  }
}
