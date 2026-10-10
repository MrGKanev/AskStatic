import { bg } from './bg.ts';
import { en } from './en.ts';
import type { LanguagePack } from './types.ts';

export type { LanguagePack } from './types.ts';
export { bg, en };

const packs = new Map<string, LanguagePack>([
  [en.code, en],
  [bg.code, bg],
]);

export function registerLanguage(pack: LanguagePack): void {
  packs.set(pack.code, pack);
}

/** Falls back to a pack with no stemming/stopwords so unknown languages still work (exact + fuzzy search). */
export function getLanguage(code: string): LanguagePack {
  const base = code.toLowerCase().split('-')[0] ?? code;
  return (
    packs.get(base) ?? {
      code: base,
      stopwords: new Set(),
      negations: new Set(),
      stem: (t) => t,
    }
  );
}
