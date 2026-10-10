import { createHash } from 'node:crypto';
import { type Entry, createEngine } from '@mrgkanev/askstatic-core';
import type { ResolvedOptions } from './options.ts';

export interface Pack {
  /** file name (relative to the output folder) -> content */
  files: Map<string, string>;
  languages: string[];
}

export interface Manifest {
  version: 1;
  defaultLanguage: string;
  /** language -> hashed file name */
  languages: Record<string, string>;
  pagefind: boolean;
}

/** Joins a site base ("/" or "/docs") with a path, without doubling slashes. */
export function withBase(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  return `${b}/${path.replace(/^\/+/, '')}`;
}

export function rebaseSources(entries: Entry[], base: string): Entry[] {
  const b = base.replace(/\/+$/, '');
  if (!b) return entries;
  return entries.map((e) => ({
    ...e,
    sources: e.sources.map((s) => (s.url.startsWith('/') && !s.url.startsWith(`${b}/`) && s.url !== b ? { ...s, url: withBase(b, s.url) } : s)),
  }));
}

export function buildPack(entries: Entry[], options: ResolvedOptions, base: string, pagefind: boolean): Pack {
  const prepared = rebaseSources(entries, base);
  const found = [...new Set(prepared.map((e) => e.language.toLowerCase().split('-')[0] as string))];
  const languages = (options.languages ?? found).map((l) => l.toLowerCase());
  const files = new Map<string, string>();
  const manifest: Manifest = { version: 1, defaultLanguage: options.defaultLanguage, languages: {}, pagefind };

  for (const lang of languages) {
    const own = prepared.filter((e) => (e.language.toLowerCase().split('-')[0] as string) === lang).map((e) => ({ ...e, language: lang }));
    if (own.length === 0) continue;
    const json = JSON.stringify(createEngine(own, lang, options.thresholds).toJSON());
    const hash = createHash('sha256').update(json).digest('hex').slice(0, 10);
    const name = `${lang}.${hash}.json`;
    files.set(name, json);
    manifest.languages[lang] = name;
  }
  files.set('manifest.json', JSON.stringify(manifest));
  return { files, languages: Object.keys(manifest.languages) };
}
