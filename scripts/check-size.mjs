// Size budget for the demo build. Usage: node scripts/check-size.mjs [distDir]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2] ?? 'demo/dist';
const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const astroFiles = readdirSync(join(dist, '_astro'));
const widget = astroFiles.find((f) => f.startsWith('AskStatic') && f.endsWith('.js'));
const runtime = astroFiles.find((f) => f.startsWith('runtime') && f.endsWith('.js'));
const manifest = JSON.parse(readFileSync(join(dist, '_askstatic/manifest.json'), 'utf8'));
const pack = Object.values(manifest.languages)[0];

const onEveryPage = gz(join(dist, '_astro', widget));
const onFirstOpen = gz(join(dist, '_astro', runtime)) + gz(join(dist, '_askstatic', pack)) + gz(join(dist, '_askstatic/manifest.json'));
const pagefindCore = manifest.pagefind ? gz(join(dist, 'pagefind/pagefind.js')) : 0;

console.log(`on every page (widget shell, gzip):      ${kb(onEveryPage)}`);
console.log(`on first chat open (engine + pack, gzip): ${kb(onFirstOpen)}`);
console.log(`on first fallback search (pagefind.js):   ${kb(pagefindCore)} (+ index chunks)`);

const BUDGET = 1024 * 1024;
const total = onFirstOpen + pagefindCore;
if (onEveryPage + total > BUDGET) {
  console.error(`over budget: ${kb(onEveryPage + total)} > ${kb(BUDGET)}`);
  process.exit(1);
}
