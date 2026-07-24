This is a Figma plugin project for exporting prototypes as video.

Tech stack: TypeScript, Figma Plugin API, Canvas API, WebCodecs (MP4) with a
MediaRecorder (WebM) fallback.

Build: esbuild bundles src/code.ts (plugin sandbox) and src/ui.ts + src/ui.html
into dist/. `npm run build` typechecks first and fails the build on type errors.

Layout:
- src/code.ts         plugin sandbox: flow discovery, timing/easing extraction, PNG export
- src/shared/types.ts message contracts shared across the sandbox/UI boundary
- src/ui.ts           UI orchestration: settings, preview, export
- src/ui/easing.ts    cubic-bezier and spring solvers matching Figma's curves
- src/ui/render.ts    frame planning and all prototype transition renderers
- src/ui/encoder.ts   MP4 (WebCodecs) and WebM (MediaRecorder) sinks

Units to keep straight: Figma reports transition durations in **seconds** and
trigger timeouts in **milliseconds**.

figma.ui.postMessage supports Uint8Array but not ArrayBuffer, and takes no
transfer list — send image bytes as Uint8Array.
