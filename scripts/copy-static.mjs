// copy-static.mjs
import { mkdirSync, copyFileSync, existsSync, readdirSync, cpSync } from "fs";
import { resolve } from "path";

const root = resolve(".");
const dist = resolve(root, "dist");
const outputDir = process.env.OUTPUT_DIR ? resolve(process.env.OUTPUT_DIR, "dist") : dist;

// ensure dist structure
mkdirSync(outputDir, { recursive: true });
mkdirSync(resolve(outputDir, "background"), { recursive: true });
mkdirSync(resolve(outputDir, "content_scripts"), { recursive: true });
mkdirSync(resolve(outputDir, "popup"), { recursive: true });
mkdirSync(resolve(outputDir, "assets"), { recursive: true });

// copy manifest.json (root -> dist)
copyFileSync(resolve(root, "manifest.json"), resolve(outputDir, "manifest.json"));

// copy popup.html (if present)
try { copyFileSync(resolve(root, "src/popup/popup.html"), resolve(outputDir, "popup/popup.html")); } catch(e) { /* ignore */ }

// copy popup.css (if present)
try { copyFileSync(resolve(root, "src/popup/popup.css"), resolve(outputDir, "popup/popup.css")); } catch(e) { /* ignore */ }

// copy assets
try {
  const assetsDir = resolve(root, "src/assets");
  if (existsSync(assetsDir)) {
    const files = readdirSync(assetsDir);
    for (const f of files) {
      copyFileSync(resolve(assetsDir, f), resolve(outputDir, "assets", f));
    }
  }
} catch(e) { /* ignore */ }

console.log("Static files copied to", outputDir);

console.log("Static files copied to dist/");