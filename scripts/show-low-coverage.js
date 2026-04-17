const fs = require('fs');
const path = require('path');

const covPath = path.resolve(process.cwd(), 'coverage', 'coverage-final.json');
if (!fs.existsSync(covPath)) {
  console.error('coverage-final.json not found at', covPath);
  process.exit(2);
}

const cov = JSON.parse(fs.readFileSync(covPath, 'utf8'));
const results = Object.entries(cov)
  .filter(([file]) => file.includes(path.sep + 'src' + path.sep))
  .map(([file, data]) => {
    const s = data.s || {};
    const total = Object.keys(s).length;
    const covered = Object.values(s).filter(v => v > 0).length;
    const pct = total === 0 ? 100 : (covered / total) * 100;
    return { file, total, covered, pct };
  })
  .sort((a, b) => a.pct - b.pct);

console.log('Low-coverage source files (statement coverage):');
console.log('------------------------------------------------');
results.slice(0, 30).forEach(r => {
  console.log(`${r.pct.toFixed(1).padStart(5)}%  ${String(r.covered).padStart(3)}/${String(r.total).padStart(3)}  ${r.file}`);
});

const avg = results.reduce((acc, r) => acc + r.pct, 0) / (results.length || 1);
console.log('\nAverage src statement coverage:', avg.toFixed(1) + '%');
