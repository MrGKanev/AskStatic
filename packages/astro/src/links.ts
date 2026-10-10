import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { Entry } from './core/index.ts';

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Returns a message for every internal source link that has no matching file in the build output. */
export function findBrokenSources(entries: Entry[], outDir: string, base: string): string[] {
  const b = base.replace(/\/+$/, '');
  const problems: string[] = [];
  for (const e of entries) {
    for (const s of e.sources) {
      if (!s.url.startsWith('/')) continue;
      let path = s.url.split(/[?#]/)[0] as string;
      if (b && path.startsWith(`${b}/`)) path = path.slice(b.length);
      const rel = decodeURIComponent(path).replace(/^\/+/, '');
      const candidates = [rel, join(rel, 'index.html'), `${rel.replace(/\/$/, '')}.html`];
      if (!candidates.some((c) => isFile(join(outDir, c)))) {
        problems.push(`${e.id}: source "${s.url}" does not exist in the build output`);
      }
    }
  }
  return problems;
}
