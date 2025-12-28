// copy-static.mjs
import { mkdirSync, copyFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

const root = resolve(".");
const dist = resolve(root, "dist");

// ensure dist structure
mkdirSync(dist, { recursive: true });
mkdirSync(resolve(dist, "background"), { recursive: true });
mkdirSync(resolve(dist, "content_scripts"), { recursive: true });
mkdirSync(resolve(dist, "popup"), { recursive: true });
mkdirSync(resolve(dist, "assets"), { recursive: true });

// copy manifest.json (root -> dist)
copyFileSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));

// copy popup.html (if present)
try { copyFileSync(resolve(root, "src/popup/popup.html"), resolve(dist, "popup/popup.html")); } catch(e) { /* ignore */ }

// copy onboarding.html (if present)
try { copyFileSync(resolve(root, "src/popup/onboarding.html"), resolve(dist, "popup/onboarding.html")); } catch(e) { /* ignore */ }

// copy popup.css (if present)
try { copyFileSync(resolve(root, "src/popup/popup.css"), resolve(dist, "popup/popup.css")); } catch(e) { /* ignore */ }

// copy assets
try {
  const assetsDir = resolve(root, "src/assets");
  if (existsSync(assetsDir)) {
    const files = readdirSync(assetsDir);
    for (const f of files) {
      copyFileSync(resolve(assetsDir, f), resolve(dist, "assets", f));
    }
  }
} catch(e) { /* ignore */ }

console.log("Static files copied to dist/");