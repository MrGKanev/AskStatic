import type { LanguagePack } from './languages/types.ts';

/** Unicode-normalise, lower-case, unify apostrophes/dashes, collapse whitespace. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words (letters/marks/digits with inner ' or -) or numbers/versions like 2.1.0 or 1,5.
const TOKEN = /\p{N}+(?:[.,]\p{N}+)*(?![\p{L}\p{N}])|[\p{L}\p{N}][\p{L}\p{M}\p{N}'_-]*/gu;

/** Raw tokens: normalised, not stemmed, nothing removed. */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  for (const m of normalizeText(input).matchAll(TOKEN)) {
    out.push(m[0].replace(/^[-'_]+|[-'_]+$/g, ''));
  }
  return out.filter(Boolean);
}

/** Tokens as they are indexed/searched. Numbers and negations are never altered. */
export function indexTerms(input: string, lang: LanguagePack): string[] {
  return tokenize(input).map((t) => (lang.negations.has(t) ? t : lang.stem(t)));
}

/** Canonical form of a whole phrase, used for exact-question matching. */
export function canonicalPhrase(input: string, lang: LanguagePack): string {
  return indexTerms(input, lang).join(' ');
}

export function isNumeric(token: string): boolean {
  return /^\p{N}+(?:[.,]\p{N}+)*$/u.test(token);
}
