import {
  DEFAULT_SETTINGS,
  EasingSpec,
  FrameSpec,
  LayerSpec,
  MAX_ANIMATED_LAYERS,
  MAX_LAYER_DEPTH,
  PluginSettings,
  Rect,
  SPRING_PRESETS,
  TransitionSpec,
} from "./shared/types";

type FlowNode = FrameNode | ComponentNode;

const SETTINGS_KEY = "prototype-to-video-settings";

// Guard against exports large enough to exhaust the UI iframe's memory.
const MAX_PIXELS_PER_IMAGE = 80_000_000;
const MAX_PIXELS_TOTAL = 400_000_000;

figma.showUI(__html__, { width: 500, height: 720, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "ui-ready") {
    const stored = await figma.clientStorage.getAsync(SETTINGS_KEY);
    figma.ui.postMessage({
      type: "settings",
      settings: { ...DEFAULT_SETTINGS, ...(stored || {}) } as PluginSettings,
    });
  }

  if (msg.type === "start-export") {
    await figma.clientStorage.setAsync(SETTINGS_KEY, msg.settings);
    try {
      await exportPrototypeFlow(msg.settings as PluginSettings);
    } catch (e) {
      figma.ui.postMessage({
        type: "error",
        message: `صار خطأ غير متوقع أثناء القراءة:\n${errorText(e)}`,
      });
    }
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// --- Reaction extraction -------------------------------------------------

interface ReactionData {
  transition: TransitionSpec | null;
  triggerDelay: number | null; // ms
  destinationId: string | null;
  navigation: string;
  overlayPosition: { x: number; y: number } | null;
}

const EMPTY_REACTION: ReactionData = {
  transition: null,
  triggerDelay: null,
  destinationId: null,
  navigation: "NAVIGATE",
  overlayPosition: null,
};

/**
 * Picks the reaction that best represents "what happens next" in a passive
 * playback: a timed auto-advance wins over anything the user has to do.
 */
function triggerPriority(trigger: Trigger | null): number {
  if (!trigger) return 0;
  switch (trigger.type) {
    case "AFTER_TIMEOUT": return 3;
    case "ON_CLICK":
    case "ON_PRESS":
    case "MOUSE_UP":
    case "MOUSE_DOWN": return 2;
    case "ON_HOVER":
    case "MOUSE_ENTER":
    case "MOUSE_LEAVE": return 1;
    default: return 1;
  }
}

function extractReactionData(node: SceneNode): ReactionData {
  const reactions = (node as any).reactions as ReadonlyArray<Reaction> | undefined;
  if (!reactions || reactions.length === 0) return EMPTY_REACTION;

  let best: ReactionData | null = null;
  let bestScore = -1;

  for (const reaction of reactions) {
    const action = reaction.action;
    if (!action || action.type !== "NODE" || !action.destinationId) continue;

    const score = triggerPriority(reaction.trigger);
    if (score <= bestScore) continue;

    const trigger = reaction.trigger as any;
    let triggerDelay: number | null = null;
    if (trigger && trigger.type === "AFTER_TIMEOUT") {
      if (typeof trigger.timeout === "number" && Number.isFinite(trigger.timeout))
        triggerDelay = trigger.timeout;
      else if (typeof trigger.delay === "number" && Number.isFinite(trigger.delay))
        triggerDelay = trigger.delay;
    }

    const overlay = action.overlayRelativePosition;

    bestScore = score;
    best = {
      transition: toTransitionSpec(action.transition),
      triggerDelay,
      destinationId: action.destinationId,
      navigation: action.navigation || "NAVIGATE",
      overlayPosition: overlay ? { x: overlay.x, y: overlay.y } : null,
    };
  }

  return best || EMPTY_REACTION;
}

function toTransitionSpec(transition: Transition | null): TransitionSpec | null {
  if (!transition) return null;
  return {
    type: transition.type,
    direction: (transition as DirectionalTransition).direction || "LEFT",
    matchLayers: (transition as DirectionalTransition).matchLayers === true,
    duration: transition.duration, // seconds
    easing: toEasingSpec(transition.easing),
  };
}

function toEasingSpec(easing: Easing | undefined): EasingSpec {
  if (!easing) return { type: "EASE_IN_AND_OUT" };

  const spec: EasingSpec = { type: easing.type };

  if (easing.easingFunctionCubicBezier) {
    const b = easing.easingFunctionCubicBezier;
    spec.bezier = { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
  }

  if (easing.easingFunctionSpring) {
    const s = easing.easingFunctionSpring;
    spec.spring = {
      mass: s.mass,
      stiffness: s.stiffness,
      damping: s.damping,
      initialVelocity: s.initialVelocity,
    };
  } else if (SPRING_PRESETS[easing.type]) {
    spec.spring = SPRING_PRESETS[easing.type];
  }

  return spec;
}

function needsLayerAnimation(t: TransitionSpec | null): boolean {
  if (!t) return false;
  return t.type === "SMART_ANIMATE" || t.matchLayers;
}

// --- Flow discovery ------------------------------------------------------

interface FlowStep {
  node: FlowNode;
  reaction: ReactionData;
}

interface Flow {
  steps: FlowStep[];
  loopToIndex: number | null;
}

function discoverFlow(settings: PluginSettings): Flow | null {
  const page = figma.currentPage;
  const selection = page.selection;

  if (settings.source !== "frames") {
    const variantFlow = findVariantFlow(selection, page, settings.source === "variants");
    if (variantFlow && variantFlow.steps.length > 0) return variantFlow;
    if (settings.source === "variants") return null;
  }

  const start = findStartingFrame(page, selection);
  if (!start) return null;
  return walkFlow(start, (id) => {
    const target = figma.getNodeById(id);
    return target && (target.type === "FRAME" || target.type === "COMPONENT")
      ? (target as FlowNode)
      : null;
  });
}

function walkFlow(
  start: FlowNode,
  resolve: (id: string) => FlowNode | null
): Flow {
  const steps: FlowStep[] = [];
  const indexById = new Map<string, number>();
  let current: FlowNode | null = start;
  let loopToIndex: number | null = null;

  while (current) {
    if (indexById.has(current.id)) {
      loopToIndex = indexById.get(current.id)!;
      break;
    }
    indexById.set(current.id, steps.length);

    const reaction = extractReactionData(current);
    steps.push({ node: current, reaction });

    current = reaction.destinationId ? resolve(reaction.destinationId) : null;
  }

  return { steps, loopToIndex };
}

function findStartingFrame(
  page: PageNode,
  selection: ReadonlyArray<SceneNode>
): FlowNode | null {
  for (const sel of selection) {
    if (sel.type === "FRAME" || sel.type === "COMPONENT") return sel;
  }

  const flowStarts = page.flowStartingPoints;
  if (flowStarts && flowStarts.length > 0) {
    const node = figma.getNodeById(flowStarts[0].nodeId);
    if (node && (node.type === "FRAME" || node.type === "COMPONENT")) return node;
  }

  const topFrames = page.children.filter(
    (c): c is FlowNode => c.type === "FRAME" || c.type === "COMPONENT"
  );

  for (const frame of topFrames) {
    if (extractReactionData(frame).destinationId) return frame;
  }

  return topFrames[0] || null;
}

function findVariantFlow(
  selection: ReadonlyArray<SceneNode>,
  page: PageNode,
  forced: boolean
): Flow | null {
  const fromSelection = componentSetFromSelection(selection);
  if (fromSelection) return walkVariants(fromSelection);

  for (const child of page.children) {
    if (child.type === "COMPONENT_SET") {
      const flow = walkVariants(child);
      if (flow.steps.length > 1) return flow;
    }
  }

  for (const child of page.children) {
    if (child.type === "FRAME") {
      for (const set of findComponentSets(child)) {
        const flow = walkVariants(set);
        if (flow.steps.length > 1) return flow;
      }
    }
  }

  return null;
}

function componentSetFromSelection(
  selection: ReadonlyArray<SceneNode>
): ComponentSetNode | null {
  for (const sel of selection) {
    if (sel.type === "COMPONENT_SET") return sel;
    if (sel.type === "COMPONENT" && sel.parent?.type === "COMPONENT_SET") {
      return sel.parent as ComponentSetNode;
    }
    if (sel.type === "INSTANCE") {
      const main = sel.mainComponent;
      if (main && main.parent?.type === "COMPONENT_SET") {
        return main.parent as ComponentSetNode;
      }
    }
  }
  return null;
}

function findComponentSets(node: SceneNode): ComponentSetNode[] {
  const results: ComponentSetNode[] = [];
  if (node.type === "COMPONENT_SET") results.push(node);
  if ("children" in node) {
    for (const child of (node as ChildrenMixin).children as SceneNode[]) {
      results.push(...findComponentSets(child));
    }
  }
  return results;
}

function walkVariants(componentSet: ComponentSetNode): Flow {
  const variants = componentSet.children.filter(
    (c): c is ComponentNode => c.type === "COMPONENT"
  );
  if (variants.length === 0) return { steps: [], loopToIndex: null };

  const byId = new Map(variants.map((v) => [v.id, v]));
  const start = findStartVariant(variants);
  const flow = walkFlow(start, (id) => byId.get(id) || null);

  if (flow.steps.length > 1) {
    if (flow.steps.length < variants.length) {
      const included = new Set(flow.steps.map((s) => s.node.id));
      const missing = variants
        .filter((v) => !included.has(v.id))
        .sort((a, b) => a.y - b.y || a.x - b.x);
      for (const v of missing) {
        flow.steps.push({ node: v, reaction: extractReactionData(v) });
      }
    }
    return flow;
  }

  // No interaction chain: fall back to the variant grid order (row-major).
  const ordered = variants.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    steps: ordered.map((node) => ({ node, reaction: EMPTY_REACTION })),
    loopToIndex: null,
  };
}

function findStartVariant(variants: ComponentNode[]): ComponentNode {
  const targets = new Set<string>();
  for (const v of variants) {
    const id = extractReactionData(v).destinationId;
    if (id) targets.add(id);
  }

  const withReactions = variants.filter((v) => extractReactionData(v).destinationId);
  const entry = withReactions.find((v) => !targets.has(v.id));
  return entry || withReactions[0] || variants[0];
}

// --- Layer decomposition for smart animate -------------------------------

interface Decomposition {
  layers: LayerSpec[];
  layerImages: Uint8Array[];
  baseImage: Uint8Array;
}

function frameOrigin(node: FlowNode): { x: number; y: number } {
  const box = node.absoluteBoundingBox;
  return box ? { x: box.x, y: box.y } : { x: node.x, y: node.y };
}

/** Render bounds include effects, matching what exportAsync rasterises. */
function layerRect(child: SceneNode, origin: { x: number; y: number }): Rect | null {
  const box = child as Partial<{
    absoluteRenderBounds: { x: number; y: number; width: number; height: number } | null;
    absoluteBoundingBox: { x: number; y: number; width: number; height: number } | null;
  }>;
  const bounds = box.absoluteRenderBounds || box.absoluteBoundingBox;
  if (!bounds) return null;
  return {
    x: bounds.x - origin.x,
    y: bounds.y - origin.y,
    w: bounds.width,
    h: bounds.height,
  };
}

/** Cheap fingerprint used to tell "moved" apart from "changed". */
function hashBytes(bytes: Uint8Array): number {
  let hash = 2166136261;
  const stride = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += stride) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ bytes.length) >>> 0;
}

function hasOwnPaint(node: SceneNode): boolean {
  const n = node as Partial<GeometryMixin & BlendMixin>;
  const fills = n.fills;
  if (Array.isArray(fills) && fills.some((f) => f.visible !== false)) return true;
  const strokes = n.strokes;
  if (Array.isArray(strokes) && strokes.some((s) => s.visible !== false)) return true;
  const effects = n.effects;
  if (Array.isArray(effects) && effects.some((e) => e.visible !== false)) return true;
  return false;
}

interface PlannedLayer {
  node: SceneNode;
  /** Render the node without its children, so its subtree can animate freely. */
  ownPaintOnly: boolean;
  path: string;
}

/**
 * True when the node only looks right composited over what sits behind it —
 * a background blur has nothing to blur once exported on its own, and blend
 * modes and masks likewise read against the backdrop. Such a node has to stay
 * baked into the frame image instead of becoming its own layer.
 */
function dependsOnBackdrop(node: SceneNode): boolean {
  const n = node as Partial<BlendMixin & SceneNodeMixin> & {
    isMask?: boolean;
    blendMode?: string;
  };

  const effects = n.effects;
  if (
    Array.isArray(effects) &&
    effects.some((e) => e.visible !== false && e.type === "BACKGROUND_BLUR")
  ) {
    return true;
  }

  if (n.isMask === true) return true;

  const blend = n.blendMode;
  return blend != null && blend !== "NORMAL" && blend !== "PASS_THROUGH";
}

/** Whether the node or anything beneath it needs the backdrop to render. */
function subtreeDependsOnBackdrop(node: SceneNode, depth = 0): boolean {
  if (dependsOnBackdrop(node)) return true;
  if (depth >= MAX_LAYER_DEPTH + 1) return false;

  const children = (node as Partial<ChildrenMixin>).children;
  if (!Array.isArray(children)) return false;

  return children.some(
    (child) => child.visible && subtreeDependsOnBackdrop(child, depth + 1)
  );
}

/**
 * Chooses which nodes animate independently. Descending past the top level is
 * what lets elements nested inside a card or group move on their own, which is
 * how Smart Animate behaves in Figma.
 */
function planLayers(
  container: SceneNode & ChildrenMixin,
  prefix: string,
  depth: number,
  budget: { left: number }
): PlannedLayer[] {
  const planned: PlannedLayer[] = [];
  const nameCounts = new Map<string, number>();

  for (const child of container.children) {
    if (!child.visible || budget.left <= 0) continue;

    // Leaving it unplanned keeps it in the frame image, where its backdrop is.
    if (subtreeDependsOnBackdrop(child)) continue;

    const seen = nameCounts.get(child.name) || 0;
    nameCounts.set(child.name, seen + 1);
    const path = `${prefix}/${child.name}#${seen}`;

    const children = (child as Partial<ChildrenMixin>).children;
    // Clipping containers would leak their overflow once split apart.
    const clips = (child as Partial<{ clipsContent: boolean }>).clipsContent === true;
    const canDescend =
      depth < MAX_LAYER_DEPTH &&
      Array.isArray(children) &&
      children.length > 0 &&
      children.length <= 20 &&
      !clips &&
      budget.left > children.length;

    if (!canDescend) {
      planned.push({ node: child, ownPaintOnly: false, path });
      budget.left--;
      continue;
    }

    if (hasOwnPaint(child)) {
      planned.push({ node: child, ownPaintOnly: true, path: `${path}/self` });
      budget.left--;
    }

    planned.push(
      ...planLayers(child as SceneNode & ChildrenMixin, path, depth + 1, budget)
    );
  }

  return planned;
}

/**
 * Exports a node with the given descendants hidden, restoring them afterwards.
 * Only nodes that became their own layer may be hidden: anything hidden here
 * and absent from the layer list would disappear from the render entirely.
 */
async function exportWithNodesHidden(
  node: SceneNode,
  hide: ReadonlyArray<SceneNode>,
  scale: number
): Promise<Uint8Array> {
  const targets = hide.filter((c) => c.visible);
  try {
    for (const target of targets) target.visible = false;
    return await node.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: scale },
    });
  } finally {
    for (const target of targets) target.visible = true;
  }
}

/** Exports a node's own paint, hiding every child it owns. */
function exportWithoutChildren(
  node: SceneNode & ChildrenMixin,
  scale: number
): Promise<Uint8Array> {
  return exportWithNodesHidden(node, node.children as SceneNode[], scale);
}

/**
 * Splits a frame into its background plus one image per animatable layer, so
 * the UI can move each piece independently the way Smart Animate does.
 *
 * Layers are hidden on the real node while the background is exported and
 * restored immediately afterwards — Figma has no API to render a subtree
 * without them. Every visible node has to end up in exactly one of the two
 * halves: whatever is hidden for the background must come back as a layer,
 * and whatever never became a layer must stay in the background.
 */
async function decomposeFrame(
  node: FlowNode,
  scale: number
): Promise<Decomposition | null> {
  const budget = { left: MAX_ANIMATED_LAYERS };
  const planned = planLayers(node, "", 0, budget);
  if (planned.length === 0 || budget.left <= 0) return null;

  const origin = frameOrigin(node);
  const layers: LayerSpec[] = [];
  const layerImages: Uint8Array[] = [];
  const promoted = new Set<SceneNode>();

  for (const item of planned) {
    const rect = layerRect(item.node, origin);
    if (!rect || rect.w <= 0 || rect.h <= 0) continue;

    const image = item.ownPaintOnly
      ? await exportWithoutChildren(item.node as SceneNode & ChildrenMixin, scale)
      : await item.node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: scale },
        });

    layers.push({
      key: item.path,
      rect,
      opacity: "opacity" in item.node ? (item.node as BlendMixin & SceneNode).opacity : 1,
      rotation: "rotation" in item.node ? (item.node as LayoutMixin).rotation : 0,
      hash: hashBytes(image),
      imageIndex: layerImages.length,
    });
    layerImages.push(image);
    promoted.add(item.node);
  }

  if (layers.length === 0) return null;

  // planLayers only descends into nodes it promoted, so hiding the frame's own
  // promoted children removes every layer and nothing else. Children left
  // unplanned — backdrop-dependent ones, or any whose bounds we could not
  // measure — stay painted in the background rather than disappearing.
  const hide = node.children.filter((child) => promoted.has(child));
  const baseImage = await exportWithNodesHidden(node, hide, scale);

  return { layers, layerImages, baseImage };
}

// --- Export --------------------------------------------------------------

function computeHold(
  triggerDelay: number | null,
  transition: TransitionSpec | null,
  fallbackMs: number
): number {
  if (triggerDelay != null && triggerDelay > 0) return triggerDelay;
  if (transition && transition.duration > 0) {
    return Math.max(transition.duration * 1000, fallbackMs);
  }
  return fallbackMs;
}

async function exportPrototypeFlow(settings: PluginSettings) {
  const flow = discoverFlow(settings);

  if (!flow || flow.steps.length === 0) {
    figma.ui.postMessage({
      type: "error",
      message:
        "لم يتم العثور على أي بروتوتايب.\n\n" +
        "جرّب:\n" +
        "• اختر الـ Component Set أو الشاشة الأولى ثم شغّل البلاجن\n" +
        "• أو غيّر «مصدر البروتوتايب» من الإعدادات",
    });
    return;
  }

  const { steps, loopToIndex } = flow;
  const scale = settings.scale;
  const warnings: string[] = [];

  const canvasWidth = Math.max(...steps.map((s) => s.node.width));
  const canvasHeight = Math.max(...steps.map((s) => s.node.height));

  if (steps.some((s) => s.node.width !== canvasWidth || s.node.height !== canvasHeight)) {
    warnings.push("الشاشات بأحجام مختلفة — تم توسيط كل شاشة داخل أكبر حجم.");
  }

  const perImage = canvasWidth * canvasHeight * scale * scale;
  if (perImage > MAX_PIXELS_PER_IMAGE) {
    figma.ui.postMessage({
      type: "error",
      message:
        `الشاشة كبيرة زيادة على جودة ${scale}x ` +
        `(${Math.round(perImage / 1_000_000)} مليون بكسل للصورة الواحدة).\n` +
        `اختر جودة أقل.`,
    });
    return;
  }
  if (perImage * steps.length > MAX_PIXELS_TOTAL) {
    warnings.push(
      `حجم التصدير كبير (${steps.length} شاشات × ${scale}x) وممكن يبطّئ المتصفح. ` +
        `لو علّق، جرّب جودة أقل.`
    );
  }

  // A frame needs decomposition if it enters or leaves a smart-animate step.
  const wantsLayers = steps.map((step, i) => {
    const outgoing = needsLayerAnimation(step.reaction.transition);
    const incomingFrom =
      i > 0
        ? steps[i - 1]
        : loopToIndex === 0
        ? steps[steps.length - 1]
        : null;
    const incoming = incomingFrom ? needsLayerAnimation(incomingFrom.reaction.transition) : false;
    return outgoing || incoming;
  });

  figma.ui.postMessage({
    type: "export-start",
    totalFrames: steps.length,
    canvasWidth,
    canvasHeight,
    scale,
    loopToIndex,
  });

  let hasAutoTiming = false;
  let smartAnimateDowngraded = false;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const { reaction } = step;

    let decomposition: Decomposition | null = null;
    if (wantsLayers[i]) {
      try {
        decomposition = await decomposeFrame(step.node, scale);
        if (!decomposition) smartAnimateDowngraded = true;
      } catch (e) {
        decomposition = null;
        smartAnimateDowngraded = true;
      }
    }

    let imageBytes: Uint8Array;
    if (decomposition) {
      imageBytes = decomposition.baseImage;
    } else {
      try {
        imageBytes = await step.node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: scale },
        });
      } catch (e) {
        figma.ui.postMessage({
          type: "error",
          message:
            `فشل تصدير "${step.node.name}" بجودة ${scale}x.\n` +
            `جرّب جودة أقل.\n(${errorText(e)})`,
        });
        return;
      }
    }

    if (reaction.triggerDelay != null) hasAutoTiming = true;

    const frame: FrameSpec = {
      id: step.node.id,
      name: step.node.name,
      width: step.node.width,
      height: step.node.height,
      holdDuration: computeHold(
        reaction.triggerDelay,
        reaction.transition,
        settings.fallbackHoldMs
      ),
      transition: reaction.transition,
      navigation: reaction.navigation,
      layers: decomposition ? decomposition.layers : null,
      hasBaseImage: decomposition != null,
      isOverlay: i > 0 && steps[i - 1].reaction.navigation === "OVERLAY",
      overlayPosition: i > 0 ? steps[i - 1].reaction.overlayPosition : null,
    };

    figma.ui.postMessage({
      type: "frame-data",
      index: i,
      total: steps.length,
      frame,
      imageBytes,
      layerImages: decomposition ? decomposition.layerImages : [],
    });

    figma.ui.postMessage({
      type: "progress",
      message: `تم تصدير: ${step.node.name}`,
      total: steps.length,
      current: i + 1,
    });
  }

  if (smartAnimateDowngraded) {
    warnings.push(
      `بعض شاشات Smart Animate فيها طبقات كثيرة (أكثر من ${MAX_ANIMATED_LAYERS}) — ` +
        `تم استبدال الأنيميشن بتلاشي فيها.`
    );
  }

  figma.ui.postMessage({ type: "export-complete", hasAutoTiming, warnings });
}
