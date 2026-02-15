// esbuild-prod.mjs - Enhanced with code splitting and tree shaking
import { build } from "esbuild";
import { resolve } from "path";

const cwd = resolve(".");
const outdir = process.env.OUTPUT_DIR ? resolve(process.env.OUTPUT_DIR, "dist") : resolve(cwd, "dist");

const common = {
  bundle: true,
  platform: "browser",
  minify: true,
  target: ["chrome109", "edge109", "firefox109"],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  treeShaking: true,
  splitting: false, // IIFE doesn't support splitting
  metafile: true, // Generate bundle analysis
  legalComments: "none",
  logLevel: "info"
};

(async () => {
  try {
    const results = [];
    
    // service worker
    const swResult = await build({
      ...common,
      entryPoints: [resolve(cwd, "src/background/service-worker.ts")],
      outfile: resolve(outdir, "background/service-worker.js"),
      format: "iife"
    });
    results.push({ name: "service-worker", result: swResult });

    // content script - extractor
    const extractorResult = await build({
      ...common,
      entryPoints: [resolve(cwd, "src/content_scripts/extractor.ts")],
      outfile: resolve(outdir, "content_scripts/extractor.js"),
      format: "iife"
    });
    results.push({ name: "extractor", result: extractorResult });

    // content script - quick-search (ultra-fast inline overlay)
    const quickSearchResult = await build({
      ...common,
      entryPoints: [resolve(cwd, "src/content_scripts/quick-search.ts")],
      outfile: resolve(outdir, "content_scripts/quick-search.js"),
      format: "iife"
    });
    results.push({ name: "quick-search", result: quickSearchResult });

    // popup
    const popupResult = await build({
      ...common,
      entryPoints: [resolve(cwd, "src/popup/popup.ts")],
      outfile: resolve(outdir, "popup/popup.js"),
      format: "iife"
    });
    results.push({ name: "popup", result: popupResult });

    console.log("\n✅ esbuild-prod: Bundles written to dist/");
    
    // Bundle size analysis
    console.log("\n📊 Bundle Size Analysis:");
    console.log("─".repeat(60));
    const fs = await import("fs");
    for (const { name, result } of results) {
      if (result.metafile) {
        const outputs = Object.entries(result.metafile.outputs);
        for (const [file, info] of outputs) {
          const sizeKB = (info.bytes / 1024).toFixed(2);
          console.log(`  ${name.padEnd(20)} ${sizeKB.padStart(10)} KB`);
        }
      }
    }
    console.log("─".repeat(60));
  } catch (err) {
    console.error("esbuild-prod error:", err);
    process.exit(1);
  }
})();