export {
  lerp,
  clamp,
  inverseLerp,
  remap,
  vectorLerp,
  vectorAdd,
  vectorSub,
  vectorScale,
  vectorLength,
  vectorNormalize,
  vectorDistance,
  identityMatrix,
  multiplyMatrices,
  transformPoint,
  degreesToRadians,
  radiansToDegrees,
  rotationMatrix,
  translationMatrix,
  scaleMatrix,
} from './math';

export {
  colorLerp,
  colorToRGBA,
  rgbaToColor,
  colorToHex,
  hexToColor,
  colorEquals,
  premultiplyAlpha,
  unpremultiplyAlpha,
  TRANSPARENT,
  WHITE,
  BLACK,
} from './color';

export {
  boundsContains,
  boundsIntersect,
  boundsUnion,
  boundsCenter,
  boundsFromSize,
  boundsToSize,
  scaleBounds,
  translateBounds,
  fitSize,
} from './geometry';

export {
  validateGraph,
} from './validation';
export type { ValidationResult, ValidationWarning, ValidationError } from './validation';
