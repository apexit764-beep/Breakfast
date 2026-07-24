interface FrameExport {
  id: string;
  name: string;
  width: number;
  height: number;
  imageData: Uint8Array;
  transition: TransitionInfo | null;
  holdDuration: number;
}

interface TransitionInfo {
  type: string;
  direction: string;
  duration: number;
  easing: string;
}

figma.showUI(__html__, { width: 480, height: 640, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "start-export") {
    await exportPrototypeFlow(msg.scale || 4, msg.fallbackHoldMs || 1000);
  }
  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};

async function exportPrototypeFlow(scale: number, fallbackHoldMs: number) {
  const page = figma.currentPage;
  const selection = page.selection;

  const variantFlow = findVariantFlow(selection, page);
  if (variantFlow && variantFlow.length > 0) {
    await exportNodes(variantFlow, scale, fallbackHoldMs);
    return;
  }

  const startingFrame = findStartingFrame(page);
  if (!startingFrame) {
    figma.ui.postMessage({
      type: "error",
      message:
        "لم يتم العثور على أي بروتوتايب.\n\n" +
        "جرّب:\n" +
        "• اختر الـ Component Set (اللي فيه الـ variants) ثم شغّل البلاجن\n" +
        "• أو تأكد من وجود اتصالات بروتوتايب بين الشاشات",
    });
    return;
  }

  const orderedFrames = walkPrototypeFlow(startingFrame);
  if (orderedFrames.length === 0) {
    figma.ui.postMessage({
      type: "error",
      message: "لم يتم العثور على أي frames في البروتوتايب.",
    });
    return;
  }

  await exportNodes(orderedFrames, scale, fallbackHoldMs);
}

interface FlowStep {
  node: FrameNode | ComponentNode;
  transition: Transition | null;
  triggerDelay: number | null;
}

interface ReactionData {
  transition: Transition | null;
  triggerDelay: number | null;
  destinationId: string | null;
}

function extractReactionData(node: SceneNode): ReactionData {
  const reactions = (node as any).reactions as ReadonlyArray<Reaction> | undefined;
  if (!reactions) return { transition: null, triggerDelay: null, destinationId: null };

  for (const reaction of reactions) {
    const action = reaction.action;
    if (!action || action.type !== "NODE" || !action.destinationId) continue;

    let triggerDelay: number | null = null;
    const trigger = reaction.trigger;
    if (trigger) {
      const t = trigger as any;
      if (t.timeout != null) triggerDelay = t.timeout;
      else if (t.delay != null) triggerDelay = t.delay;
    }

    return {
      transition: action.transition || null,
      triggerDelay,
      destinationId: action.destinationId,
    };
  }

  return { transition: null, triggerDelay: null, destinationId: null };
}

function computeHoldDuration(
  triggerDelay: number | null,
  transitionDuration: number | null,
  fallbackMs: number
): number {
  if (triggerDelay != null) return triggerDelay;
  if (transitionDuration != null && transitionDuration > 0) {
    return Math.max(transitionDuration * 1000 * 2, 500);
  }
  return fallbackMs;
}

// --- Variant flow ---

function findVariantFlow(
  selection: ReadonlyArray<SceneNode>,
  page: PageNode
): FlowStep[] | null {
  if (selection.length > 0) {
    const sel = selection[0];
    if (sel.type === "COMPONENT_SET") return walkVariants(sel);
    if (sel.type === "COMPONENT" && sel.parent?.type === "COMPONENT_SET")
      return walkVariants(sel.parent as ComponentSetNode);
    if (sel.type === "INSTANCE") {
      const main = sel.mainComponent;
      if (main && main.parent?.type === "COMPONENT_SET")
        return walkVariants(main.parent as ComponentSetNode);
    }
  }

  for (const child of page.children) {
    if (child.type === "COMPONENT_SET") {
      const flow = walkVariants(child);
      if (flow.length > 1) return flow;
    }
  }

  for (const child of page.children) {
    if (child.type === "FRAME") {
      const sets = findComponentSets(child);
      for (const set of sets) {
        const flow = walkVariants(set);
        if (flow.length > 1) return flow;
      }
    }
  }

  return null;
}

function findComponentSets(node: SceneNode): ComponentSetNode[] {
  const results: ComponentSetNode[] = [];
  if (node.type === "COMPONENT_SET") results.push(node);
  if ("children" in node) {
    for (const child of (node as any).children)
      results.push(...findComponentSets(child));
  }
  return results;
}

function walkVariants(componentSet: ComponentSetNode): FlowStep[] {
  const variants = componentSet.children.filter(
    (c): c is ComponentNode => c.type === "COMPONENT"
  );
  if (variants.length === 0) return [];

  const startVariant = findStartVariant(variants);
  const chain = walkVariantChain(startVariant, variants);
  if (chain.length > 1) return chain;

  variants.sort((a, b) => a.x - b.x || a.y - b.y);
  return variants.map((v) => ({
    node: v,
    transition: null,
    triggerDelay: null,
  }));
}

function findStartVariant(variants: ComponentNode[]): ComponentNode {
  const targetIds = new Set<string>();
  for (const v of variants) {
    const { destinationId } = extractReactionData(v);
    if (destinationId) targetIds.add(destinationId);
  }

  for (const v of variants) {
    if (!targetIds.has(v.id)) {
      const reactions = (v as any).reactions as ReadonlyArray<Reaction> | undefined;
      if (reactions && reactions.length > 0) return v;
    }
  }
  for (const v of variants) {
    const reactions = (v as any).reactions as ReadonlyArray<Reaction> | undefined;
    if (reactions && reactions.length > 0) return v;
  }
  return variants[0];
}

function walkVariantChain(start: ComponentNode, allVariants: ComponentNode[]): FlowStep[] {
  const visited = new Set<string>();
  const result: FlowStep[] = [];
  const variantIds = new Set(allVariants.map((v) => v.id));
  let current: ComponentNode | null = start;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const { transition, triggerDelay, destinationId } = extractReactionData(current);
    result.push({ node: current, transition, triggerDelay });

    if (destinationId && variantIds.has(destinationId)) {
      current = allVariants.find((v) => v.id === destinationId) || null;
    } else {
      current = null;
    }
  }

  return result;
}

// --- Frame flow ---

function findStartingFrame(page: PageNode): FrameNode | ComponentNode | null {
  const flowStarts = page.flowStartingPoints;
  if (flowStarts && flowStarts.length > 0) {
    const node = figma.getNodeById(flowStarts[0].nodeId);
    if (node && (node.type === "FRAME" || node.type === "COMPONENT")) return node;
  }

  const topFrames = page.children.filter(
    (c): c is FrameNode | ComponentNode => c.type === "FRAME" || c.type === "COMPONENT"
  );

  for (const frame of topFrames) {
    const reactions = (frame as any).reactions as ReadonlyArray<Reaction> | undefined;
    if (reactions && reactions.length > 0) return frame;
  }

  return topFrames[0] || null;
}

function walkPrototypeFlow(startNode: FrameNode | ComponentNode): FlowStep[] {
  const visited = new Set<string>();
  const result: FlowStep[] = [];
  let current: FrameNode | ComponentNode | null = startNode;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const { transition, triggerDelay, destinationId } = extractReactionData(current);
    result.push({ node: current, transition, triggerDelay });

    if (destinationId) {
      const target = figma.getNodeById(destinationId);
      current = target && (target.type === "FRAME" || target.type === "COMPONENT") ? target : null;
    } else {
      current = null;
    }
  }

  if (result.length <= 1) {
    const topFrames = figma.currentPage.children.filter(
      (c): c is FrameNode | ComponentNode =>
        (c.type === "FRAME" || c.type === "COMPONENT") && !visited.has(c.id)
    );
    topFrames.sort((a, b) => a.x - b.x || a.y - b.y);
    for (const frame of topFrames) {
      if (!visited.has(frame.id)) {
        visited.add(frame.id);
        result.push({ node: frame, transition: null, triggerDelay: null });
      }
    }
  }

  return result;
}

// --- Export (send frames one by one to avoid OOM) ---

async function exportNodes(orderedFrames: FlowStep[], scale: number, fallbackHoldMs: number) {
  const firstNode = orderedFrames[0].node;
  let hasAutoTiming = false;

  figma.ui.postMessage({
    type: "export-start",
    totalFrames: orderedFrames.length,
    canvasWidth: firstNode.width,
    canvasHeight: firstNode.height,
    scale,
  });

  for (let i = 0; i < orderedFrames.length; i++) {
    const step = orderedFrames[i];

    const imageData = await step.node.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: scale },
    });

    const transitionDuration = step.transition?.duration ?? null;
    const holdDuration = computeHoldDuration(step.triggerDelay, transitionDuration, fallbackHoldMs);
    if (step.triggerDelay != null) hasAutoTiming = true;

    const transitionInfo: TransitionInfo | null = step.transition
      ? {
          type: step.transition.type || "DISSOLVE",
          direction: (step.transition as any).direction || "LEFT",
          duration: step.transition.duration || 0.3,
          easing: getEasingName(step.transition.easing),
        }
      : null;

    figma.ui.postMessage(
      {
        type: "frame-data",
        index: i,
        total: orderedFrames.length,
        frame: {
          id: step.node.id,
          name: step.node.name,
          width: step.node.width,
          height: step.node.height,
          transition: transitionInfo,
          holdDuration,
        },
        imageBuffer: imageData.buffer,
        hasAutoTiming,
      },
      [imageData.buffer]
    );

    figma.ui.postMessage({
      type: "progress",
      message: `تم تصدير: ${step.node.name}`,
      total: orderedFrames.length,
      current: i + 1,
    });
  }

  figma.ui.postMessage({ type: "export-complete", hasAutoTiming });
}

function getEasingName(easing: Easing): string {
  if (!easing) return "ease-in-out";
  switch (easing.type) {
    case "EASE_IN": return "ease-in";
    case "EASE_OUT": return "ease-out";
    case "EASE_IN_AND_OUT": return "ease-in-out";
    case "LINEAR": return "linear";
    case "EASE_IN_BACK": return "ease-in-back";
    case "EASE_OUT_BACK": return "ease-out-back";
    case "EASE_IN_AND_OUT_BACK": return "ease-in-out-back";
    case "GENTLE": return "gentle";
    default: return "ease-in-out";
  }
}
