// esbuild-dev.mjs
import { build } from "esbuild";
import { resolve } from "path";

const cwd = resolve(".");
const outdir = process.env.OUTPUT_DIR ? resolve(process.env.OUTPUT_DIR, "dist") : resolve(cwd, "dist");

const common = {
  sourcemap: false,
  bundle: true,
  platform: "browser",
  target: ["chrome109", "edge109", "firefox109"],
  define: { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development") }
};

(async () => {
  try {
    // service worker
    //
    // Bundle format is IIFE while manifest.json declares `"type": "module"`.
    // These coexist intentionally: the IIFE has no top-level import/export
    // statements, so Chrome parses it as a valid (if trivial) module. See
    // esbuild-prod.mjs for the full rationale before changing this.
    await build({
      ...common,
      entryPoints: [resolve(cwd, "src/background/service-worker.ts")],
      outfile: resolve(outdir, "background/service-worker.js"),
      format: "iife"
    });

    // content script - extractor
    await build({
      ...common,
      entryPoints: [resolve(cwd, "src/content_scripts/extractor.ts")],
      outfile: resolve(outdir, "content_scripts/extractor.js"),
      format: "iife"
    });

    // content script - quick-search (ultra-fast inline overlay)
    await build({
      ...common,
      entryPoints: [resolve(cwd, "src/content_scripts/quick-search.ts")],
      outfile: resolve(outdir, "content_scripts/quick-search.js"),
      format: "iife"
    });

    // popup
    await build({
      ...common,
      entryPoints: [resolve(cwd, "src/popup/popup.ts")],
      outfile: resolve(outdir, "popup/popup.js"),
      format: "iife"
    });

    console.log("esbuild-dev: Bundles written to dist/");
  } catch (err) {
    console.error("esbuild-dev error:", err);
    process.exit(1);
  }
})();