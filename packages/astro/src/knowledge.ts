import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface LoadedKnowledge {
  items: unknown[];
  /** Parallel to `items`: the file each item came from. */
  files: string[];
  errors: string[];
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (d.name.startsWith('_') || d.name.startsWith('.')) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(p)));
    else if (['.json', '.yaml', '.yml'].includes(extname(d.name).toLowerCase())) out.push(p);
  }
  return out.sort();
}

/** Reads every .json/.yaml/.yml file. A file may hold one entry or an array of entries. Names starting with "_" or "." are skipped. */
export async function loadKnowledge(dir: string, root: string): Promise<LoadedKnowledge> {
  const result: LoadedKnowledge = { items: [], files: [], errors: [] };
  if (!existsSync(dir)) {
    result.errors.push(`knowledge folder not found: ${relative(root, dir) || dir}`);
    return result;
  }
  for (const file of await walk(dir)) {
    const rel = relative(root, file);
    try {
      const text = await readFile(file, 'utf8');
      const data = extname(file).toLowerCase() === '.json' ? JSON.parse(text) : parseYaml(text);
      for (const item of Array.isArray(data) ? data : [data]) {
        result.items.push(item);
        result.files.push(rel);
      }
    } catch (e) {
      result.errors.push(`${rel}: ${(e as Error).message}`);
    }
  }
  return result;
}
