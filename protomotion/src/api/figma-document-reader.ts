/**
 * IDocumentReader implementation backed by the Figma Plugin API.
 *
 * Reads high-level document metadata: flows, background color, device
 * frame, and top-level frame IDs. All methods are synchronous because
 * the Figma API exposes these as immediate property reads.
 */

import type { IDocumentReader, DocumentInfo } from './document-reader';
import type { PrototypeFlow } from '@/types/prototype';
import type { DeviceFrame, DeviceType } from '@/types/prototype';
import type { Color } from '@/types/primitives';

export class FigmaDocumentReader implements IDocumentReader {
  getDocumentInfo(): DocumentInfo {
    return {
      name: figma.root.name,
      currentPageName: figma.currentPage.name,
      currentPageId: figma.currentPage.id,
    };
  }

  getPrototypeFlows(): PrototypeFlow[] {
    return figma.currentPage.flowStartingPoints.map((flow) => ({
      id: flow.nodeId,
      name: flow.name,
      startingNodeId: flow.nodeId,
    }));
  }

  getPageBackgroundColor(): Color {
    const bg = figma.currentPage.backgrounds;
    if (bg.length > 0 && bg[0].type === 'SOLID') {
      const paint = bg[0] as SolidPaint;
      return {
        r: paint.color.r,
        g: paint.color.g,
        b: paint.color.b,
        a: paint.opacity ?? 1,
      };
    }
    return { r: 0.95, g: 0.95, b: 0.95, a: 1 };
  }

  getDeviceFrame(): DeviceFrame {
    const settings = figma.currentPage.prototypeStartNode;
    if (!settings) {
      return { type: 'NONE', size: { width: 0, height: 0 } };
    }

    const frame = figma.getNodeById(
      figma.currentPage.flowStartingPoints[0]?.nodeId ?? '',
    );
    if (!frame || !('width' in frame)) {
      return { type: 'NONE', size: { width: 0, height: 0 } };
    }

    const size = {
      width: (frame as FrameNode).width,
      height: (frame as FrameNode).height,
    };
    const deviceType = this.inferDeviceType(size);

    return { type: deviceType, size };
  }

  getTopLevelFrameIds(): string[] {
    return figma.currentPage.children
      .filter((node): node is FrameNode => node.type === 'FRAME' || node.type === 'COMPONENT')
      .map((node) => node.id);
  }

  private inferDeviceType(size: { width: number; height: number }): DeviceType {
    const DEVICE_SIZES: Array<[DeviceType, number, number]> = [
      ['IPHONE_15_PRO', 393, 852],
      ['IPHONE_15', 393, 852],
      ['IPHONE_14_PRO', 393, 852],
      ['IPHONE_14', 390, 844],
      ['IPHONE_SE', 375, 667],
      ['PIXEL_7', 412, 915],
      ['GALAXY_S23', 360, 780],
      ['IPAD_PRO_11', 834, 1194],
      ['IPAD_PRO_12_9', 1024, 1366],
      ['MACBOOK_PRO', 1440, 900],
      ['SURFACE_PRO', 1368, 912],
    ];

    for (const [type, w, h] of DEVICE_SIZES) {
      if (
        (size.width === w && size.height === h) ||
        (size.width === h && size.height === w)
      ) {
        return type;
      }
    }
    return 'NONE';
  }
}
