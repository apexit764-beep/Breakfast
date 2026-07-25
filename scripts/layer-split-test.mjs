import fs from "fs";
import vm from "vm";

// Runs dist/code.js against a stand-in Figma scene to check the decomposition
// invariant: every visible node must end up either as its own layer or painted
// into the frame background — never hidden for the background and then left
// out of the layer list, which is how a node silently disappears.

const code = fs.readFileSync(new URL("../dist/code.js", import.meta.url), "utf8");

let nextId = 0;
const exportLog = [];

function node(props) {
  const n = {
    id: `n${nextId++}`,
    type: "FRAME",
    visible: true,
    x: 0, y: 0, width: 300, height: 600,
    opacity: 1, rotation: 0, blendMode: "NORMAL",
    fills: [{ type: "SOLID", visible: true }],
    strokes: [], effects: [], reactions: [],
    children: [],
    clipsContent: false,
    isMask: false,
    ...props,
  };
  n.absoluteBoundingBox = { x: n.x, y: n.y, width: n.width, height: n.height };
  n.absoluteRenderBounds = n.absoluteBoundingBox;
  n.exportAsync = async () => {
    // Record which named nodes were visible at the moment of each export.
    const seen = {};
    const walk = (m) => {
      seen[m.name] = m.visible;
      (m.children || []).forEach(walk);
    };
    walk(root);
    exportLog.push({ target: n.name, visibility: seen });
    return new Uint8Array([1, 2, 3, 4, nextId % 251]);
  };
  for (const c of n.children) c.parent = n;
  return n;
}

const smartAnimate = (destinationId) => ([{
  trigger: { type: "ON_CLICK" },
  action: {
    type: "NODE", destinationId, navigation: "NAVIGATE",
    transition: {
      type: "SMART_ANIMATE", duration: 0.6,
      easing: { type: "EASE_IN_AND_OUT" }, direction: "LEFT",
    },
  },
}]);

function variant(name, extra = {}) {
  return node({
    name, type: "COMPONENT",
    children: [
      node({ name: `${name}/Card`, width: 200, height: 120 }),
      node({
        name: `${name}/BlurPanel`, width: 280, height: 90,
        // The panel that vanished: its look comes entirely from the backdrop.
        effects: [{ type: "BACKGROUND_BLUR", visible: true, radius: 20 }],
      }),
      node({ name: `${name}/Title`, width: 180, height: 40 }),
    ],
    ...extra,
  });
}

const v1 = variant("V1");
const v2 = variant("V2");
v1.reactions = smartAnimate(v2.id);

const set = node({ name: "Set", type: "COMPONENT_SET", children: [v1, v2] });
for (const c of set.children) c.parent = set;
const root = node({ name: "Page", children: [set] });
set.parent = root;

const byId = new Map();
(function index(n) { byId.set(n.id, n); (n.children || []).forEach(index); })(root);

const sent = [];
let onmessage = null;

const figma = {
  showUI: () => {},
  ui: {
    postMessage: (m) => sent.push(m),
    set onmessage(fn) { onmessage = fn; },
    get onmessage() { return onmessage; },
  },
  clientStorage: { getAsync: async () => null, setAsync: async () => {} },
  currentPage: { selection: [set], children: [set], flowStartingPoints: [] },
  getNodeById: (id) => byId.get(id) || null,
  closePlugin: () => {},
};

vm.runInNewContext(code, { figma, __html__: "", console });

await onmessage({
  type: "start-export",
  settings: { scale: 2, fallbackHoldMs: 1000, fps: 60, bitrate: 10000000, format: "mp4", source: "variants" },
});
await new Promise((r) => setTimeout(r, 200));

const frames = sent.filter((m) => m.type === "frame-data");
console.log(`frames exported: ${frames.length}`);

const first = frames[0];
if (!first) {
  console.log("FAIL — nothing was exported");
  process.exit(1);
}

const layerKeys = (first.frame.layers || []).map((l) => l.key);
console.log(`layers on frame 1: ${JSON.stringify(layerKeys)}`);

const blurPromoted = layerKeys.some((k) => k.includes("BlurPanel"));
console.log(`blur panel promoted to its own layer: ${blurPromoted}`);

// The frame background is the last export for that frame.
const baseExport = exportLog.filter((e) => e.target === "V1").pop();
const blurVisibleInBase = baseExport?.visibility["V1/BlurPanel"];
const cardVisibleInBase = baseExport?.visibility["V1/Card"];
console.log(`blur panel painted into background: ${blurVisibleInBase}`);
console.log(`card hidden from background:        ${cardVisibleInBase === false}`);

const ok =
  first.frame.layers &&
  !blurPromoted &&          // backdrop-dependent, so it must not be a layer
  blurVisibleInBase &&      // and it must survive in the background
  cardVisibleInBase === false; // while real layers are hidden there

console.log(
  ok
    ? "\nPASS — blur stays composited, layers stay separate, nothing vanishes"
    : "\nFAIL — decomposition drops or misplaces a node"
);
process.exit(ok ? 0 : 1);
