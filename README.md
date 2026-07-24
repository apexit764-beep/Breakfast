# Figma Prototype to Video Exporter

A Figma plugin that exports prototype flows as video files.

## How it works

1. Select a prototype flow in your Figma file
2. The plugin reads all frames and transition settings (duration, easing, animation type)
3. Each frame is exported as an image
4. Frames are composited into a video with animated transitions using Canvas + MediaRecorder API

## Development

```bash
npm install
npm run build
```

Then load the plugin in Figma:
- Figma → Plugins → Development → Import plugin from manifest
- Select the `manifest.json` file
