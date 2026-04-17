const fs = require('fs');
const path = require('path');

const src = path.resolve(process.cwd(), 'coverage');
const dest = path.resolve(process.cwd(), 'docs', 'quality-report', 'coverage');

if (!fs.existsSync(src)) {
  console.error('Source coverage directory not found:', src);
  process.exit(2);
}

function copyDir(s, d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  const entries = fs.readdirSync(s, { withFileTypes: true });
  for (const e of entries) {
    const sp = path.join(s, e.name);
    const dp = path.join(d, e.name);
    if (e.isDirectory()) {
      copyDir(sp, dp);
    } else if (e.isFile()) {
      fs.copyFileSync(sp, dp);
    }
  }
}

copyDir(src, dest);
console.log('Copied coverage to', dest);
