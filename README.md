# Figma Prototype to Video Exporter

A Figma plugin that exports prototype flows as MP4 or WebM video, reproducing
the prototype's own timing, transitions, and easing curves.

## What it handles

**Flows**
- Frame-to-frame prototype flows, starting from the flow starting point,
  the current selection, or the first connected frame
- Interactive components: variant chains inside a Component Set
- Flows that loop back to an earlier screen
- Overlays, composited over the screen underneath

**Timing** — read from the prototype itself
- Trigger delays (After Delay and the delay on click/hover triggers)
- Per-transition durations
- The fallback duration in the UI applies only to screens with no timing of
  their own

**Transitions**
- Dissolve, Smart Animate, Scroll Animate
- Move in/out, Push, Slide in/out, in all four directions

**Easing**
- Linear, Ease in/out/in-and-out, and the three Back curves
- Custom cubic-bezier curves
- Spring curves (Gentle, Quick, Bouncy, Slow, and custom springs), simulated as
  a damped oscillator and run for the spring's own settling time

Smart Animate splits each screen into its background plus one image per
top-level layer. Layers that appear in both screens morph between their
positions and sizes while their contents cross-fade; layers on only one side
fade in or out.

## Output

MP4 (H.264) via WebCodecs, where every frame carries an explicit timestamp, so
the exported video runs at exactly the intended speed regardless of how long
rendering takes. Falls back to WebM (MediaRecorder) when WebCodecs is
unavailable.

Configurable: 1x–4x resolution, 24/30/60 fps, and 5–40 Mbps bitrate.

## Development

```bash
npm install
npm run build     # typechecks, then bundles into dist/
npm run watch     # rebuild on change
npm run typecheck
```

Load it in Figma:
- Figma → Plugins → Development → Import plugin from manifest
- Select `manifest.json`

## Notes

- Figma reports transition durations in seconds and trigger timeouts in
  milliseconds.
- `figma.ui.postMessage` supports `Uint8Array` but not `ArrayBuffer`.
- Exporting a Smart Animate screen briefly hides that frame's children to
  render its background, then restores them. This registers as an edit in the
  file's undo history.
- Spring preset parameters approximate Figma's built-in curves; custom springs
  use the exact values from the file.
