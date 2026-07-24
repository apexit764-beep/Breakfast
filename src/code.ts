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

type ExportableNode = FrameNode | ComponentNode | ComponentSetNode;

figma.showUI(__html__, { width: 480, height: 640, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "start-export") {
    await exportPrototypeFlow(msg.scale || 4, msg.holdMs || 1000);
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};

async function exportPrototypeFlow(scale: number, holdMs: number) {
  const page = figma.currentPage;
  const selection = figma.currentPage.selection;

  // Check if user selected a component set or a variant component
  const variantFlow = findVariantFlow(selection, page);

  if (variantFlow && variantFlow.length > 0) {
    await exportNodes(variantFlow, scale, holdMs);
    return;
  }

  // Fallback to top-level frame flow
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

  await exportNodes(orderedFrames, scale, holdMs);
}

interface FlowStep {
  node: FrameNode | ComponentNode;
  transition: Transition | null;
}

function findVariantFlow(
  selection: ReadonlyArray<SceneNode>,
  page: PageNode
): FlowStep[] | null {
  // Try from selection first
  if (selection.length > 0) {
    const sel = selection[0];

    // Selected a ComponentSet directly
    if (sel.type === "COMPONENT_SET") {
      return walkVariants(sel);
    }

    // Selected a Component that's inside a ComponentSet
    if (sel.type === "COMPONENT" && sel.parent?.type === "COMPONENT_SET") {
      return walkVariants(sel.parent as ComponentSetNode);
    }

    // Selected an instance — find its main component's set
    if (sel.type === "INSTANCE") {
      const main = sel.mainComponent;
      if (main && main.parent?.type === "COMPONENT_SET") {
        return walkVariants(main.parent as ComponentSetNode);
      }
    }
  }

  // Auto-detect: search page for ComponentSets with variant interactions
  for (const child of page.children) {
    if (child.type === "COMPONENT_SET") {
      const flow = walkVariants(child);
      if (flow.length > 1) return flow;
    }
  }

  // Deep search: look inside frames for component sets
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
  if (node.type === "COMPONENT_SET") {
    results.push(node);
  }
  if ("children" in node) {
    for (const child of (node as any).children) {
      results.push(...findComponentSets(child));
    }
  }
  return results;
}

function walkVariants(componentSet: ComponentSetNode): FlowStep[] {
  const variants = componentSet.children.filter(
    (c): c is ComponentNode => c.type === "COMPONENT"
  );

  if (variants.length === 0) return [];

  // Try to find a variant chain via reactions (SWAP interactions)
  const startVariant = findStartVariant(variants);
  const chain = walkVariantChain(startVariant, variants);

  if (chain.length > 1) return chain;

  // No interaction chain found — export all variants in order (left to right, top to bottom)
  variants.sort((a, b) => a.x - b.x || a.y - b.y);
  return variants.map((v, i) => ({
    node: v,
    transition: i === 0 ? null : { type: "DISSOLVE", duration: 0.3, easing: { type: "EASE_IN_AND_OUT" } } as any,
  }));
}

function findStartVariant(variants: ComponentNode[]): ComponentNode {
  const targetIds = new Set<string>();

  for (const v of variants) {
    const reactions = (v as any).reactions as ReadonlyArray<Reaction> | undefined;
    if (!reactions) continue;
    for (const r of reactions) {
      if (r.action?.type === "NODE" && r.action.destinationId) {
        targetIds.add(r.action.destinationId);
      }
    }
  }

  // Start variant = one that no other variant points to
  for (const v of variants) {
    if (!targetIds.has(v.id)) {
      const reactions = (v as any).reactions as ReadonlyArray<Reaction> | undefined;
      if (reactions && reactions.length > 0) return v;
    }
  }

  // Fallback: first variant with reactions
  for (const v of variants) {
    const reactions = (v as any).reactions as ReadonlyArray<Reaction> | undefined;
    if (reactions && reactions.length > 0) return v;
  }

  return variants[0];
}

function walkVariantChain(
  start: ComponentNode,
  allVariants: ComponentNode[]
): FlowStep[] {
  const visited = new Set<string>();
  const result: FlowStep[] = [];
  let current: ComponentNode | null = start;
  let currentTransition: Transition | null = null;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.push({ node: current, transition: currentTransition });

    const next = getNextVariant(current, allVariants);
    if (next) {
      current = next.targetNode;
      currentTransition = next.transition;
    } else {
      current = null;
      currentTransition = null;
    }
  }

  return result;
}

function getNextVariant(
  node: ComponentNode,
  allVariants: ComponentNode[]
): { targetNode: ComponentNode; transition: Transition } | null {
  const reactions = (node as any).reactions as ReadonlyArray<Reaction> | undefined;
  if (!reactions) return null;

  const variantIds = new Set(allVariants.map((v) => v.id));

  for (const reaction of reactions) {
    const action = reaction.action;
    if (!action) continue;

    if (action.type === "NODE" && action.destinationId) {
      // Check if target is a sibling variant
      if (variantIds.has(action.destinationId)) {
        const target = allVariants.find((v) => v.id === action.destinationId)!;
        return {
          targetNode: target,
          transition: action.transition || null,
        };
      }
    }
  }

  return null;
}

async function exportNodes(
  orderedFrames: FlowStep[],
  scale: number,
  holdMs: number
) {
  figma.ui.postMessage({
    type: "progress",
    message: `جاري تصدير ${orderedFrames.length} شاشات بجودة ${scale}x...`,
    total: orderedFrames.length,
    current: 0,
  });

  const frames: FrameExport[] = [];

  for (let i = 0; i < orderedFrames.length; i++) {
    const { node, transition } = orderedFrames[i];

    const imageData = await node.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: scale },
    });

    frames.push({
      id: node.id,
      name: node.name,
      width: node.width,
      height: node.height,
      imageData,
      transition: transition
        ? {
            type: transition.type || "DISSOLVE",
            direction: (transition as any).direction || "LEFT",
            duration: transition.duration || 0.3,
            easing: getEasingName(transition.easing),
          }
        : null,
      holdDuration: holdMs,
    });

    figma.ui.postMessage({
      type: "progress",
      message: `تم تصدير: ${node.name}`,
      total: orderedFrames.length,
      current: i + 1,
    });
  }

  const firstNode = orderedFrames[0].node;
  figma.ui.postMessage({
    type: "frames-ready",
    frames: frames.map((f) => ({
      ...f,
      imageData: Array.from(f.imageData),
    })),
    canvasWidth: firstNode.width,
    canvasHeight: firstNode.height,
    scale,
  });
}

function findStartingFrame(
  page: PageNode
): FrameNode | ComponentNode | null {
  const flowStarts = page.flowStartingPoints;
  if (flowStarts && flowStarts.length > 0) {
    const node = figma.getNodeById(flowStarts[0].nodeId);
    if (node && (node.type === "FRAME" || node.type === "COMPONENT")) {
      return node;
    }
  }

  const topFrames = page.children.filter(
    (c): c is FrameNode | ComponentNode =>
      c.type === "FRAME" || c.type === "COMPONENT"
  );

  for (const frame of topFrames) {
    const reactions = (frame as any).reactions as
      | ReadonlyArray<Reaction>
      | undefined;
    if (reactions && reactions.length > 0) {
      return frame;
    }
  }

  return topFrames[0] || null;
}

function walkPrototypeFlow(
  startNode: FrameNode | ComponentNode
): FlowStep[] {
  const visited = new Set<string>();
  const result: FlowStep[] = [];
  let current: FrameNode | ComponentNode | null = startNode;
  let currentTransition: Transition | null = null;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.push({ node: current, transition: currentTransition });

    const next = getNextFrame(current);
    if (next) {
      current = next.targetNode;
      currentTransition = next.transition;
    } else {
      current = null;
      currentTransition = null;
    }
  }

  if (result.length <= 1) {
    const page = figma.currentPage;
    const topFrames = page.children.filter(
      (c): c is FrameNode | ComponentNode =>
        (c.type === "FRAME" || c.type === "COMPONENT") &&
        !visited.has(c.id)
    );

    topFrames.sort((a, b) => a.x - b.x || a.y - b.y);

    for (const frame of topFrames) {
      if (!visited.has(frame.id)) {
        visited.add(frame.id);
        result.push({ node: frame, transition: null });
      }
    }
  }

  return result;
}

function getNextFrame(
  node: FrameNode | ComponentNode
): { targetNode: FrameNode | ComponentNode; transition: Transition } | null {
  const reactions = (node as any).reactions as
    | ReadonlyArray<Reaction>
    | undefined;
  if (!reactions) return null;

  for (const reaction of reactions) {
    const action = reaction.action;
    if (!action) continue;

    if (action.type === "NODE" && action.destinationId) {
      const target = figma.getNodeById(action.destinationId);
      if (
        target &&
        (target.type === "FRAME" || target.type === "COMPONENT")
      ) {
        return {
          targetNode: target,
          transition: action.transition || null,
        };
      }
    }
  }

  return null;
}

function getEasingName(easing: Easing): string {
  if (!easing) return "ease-in-out";
  switch (easing.type) {
    case "EASE_IN":
      return "ease-in";
    case "EASE_OUT":
      return "ease-out";
    case "EASE_IN_AND_OUT":
      return "ease-in-out";
    case "LINEAR":
      return "linear";
    case "EASE_IN_BACK":
      return "ease-in-back";
    case "EASE_OUT_BACK":
      return "ease-out-back";
    case "EASE_IN_AND_OUT_BACK":
      return "ease-in-out-back";
    case "GENTLE":
      return "gentle";
    default:
      return "ease-in-out";
  }
}
