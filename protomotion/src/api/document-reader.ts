/**
 * Reads high-level document structure from the Figma API.
 */

import type { PrototypeFlow, DeviceFrame } from '@/types/prototype';
import type { Color } from '@/types/primitives';

export interface DocumentInfo {
  readonly name: string;
  readonly currentPageName: string;
  readonly currentPageId: string;
}

export interface IDocumentReader {
  getDocumentInfo(): DocumentInfo;
  getPrototypeFlows(): PrototypeFlow[];
  getPageBackgroundColor(): Color;
  getDeviceFrame(): DeviceFrame;
  getTopLevelFrameIds(): string[];
}
