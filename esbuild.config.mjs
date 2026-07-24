import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";

const isWatch = process.argv.includes("--watch");

// Build the plugin sandbox code
const codeConfig = {
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2020",
  format: "iife",
};

// Build the UI: inline everything into a single HTML file
const uiPlugin = {
  name: "inline-ui",
  setup(build) {
    build.onEnd(() => {
      const uiSrc = fs.readFileSync("src/ui.html", "utf8");
      const tsBundle = fs.readFileSync("dist/ui-bundle.js", "utf8");
      const html = uiSrc.replace(
        "<!-- SCRIPT_INJECT -->",
        `<script>${tsBundle}</script>`
      );
      fs.writeFileSync("dist/ui.html", html);
      fs.unlinkSync("dist/ui-bundle.js");
    });
  },
};

const uiConfig = {
  entryPoints: ["src/ui.ts"],
  bundle: true,
  outfile: "dist/ui-bundle.js",
  target: "es2020",
  format: "iife",
  plugins: [uiPlugin],
};

fs.mkdirSync("dist", { recursive: true });

if (isWatch) {
  const codeCtx = await esbuild.context(codeConfig);
  const uiCtx = await esbuild.context(uiConfig);
  await codeCtx.watch();
  await uiCtx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(codeConfig);
  await esbuild.build(uiConfig);
  console.log("Build complete.");
}
