import MiniSearch, { type AsPlainObject } from 'minisearch';
import { getLanguage } from './languages/index.ts';
import type { LanguagePack } from './languages/types.ts';
import { canonicalPhrase, indexTerms, isNumeric, tokenize } from './normalize.ts';
import type { Entry } from './schema.ts';

export interface Thresholds {
  /** Share of meaningful query terms that must match the top candidate. */
  minCoverage: number;
  /** Absolute MiniSearch score floor for the top candidate. */
  minScore: number;
  /** Candidates within this fraction of the top score count as "close". */
  gap: number;
  maxCandidates: number;
  /** Lowest coverage accepted for a long message. Short questions need `minCoverage`; every extra word beyond five lowers the bar by 0.04 down to this floor. */
  longQueryFloor: number;
  /** When unsure, offer the best matches as "did you mean" instead of a dead end. */
  suggestUnsure: boolean;
}

export const defaultThresholds: Thresholds = { minCoverage: 0.6, minScore: 2, gap: 0.25, maxCandidates: 3, longQueryFloor: 0.3, suggestUnsure: true };

export interface Candidate {
  entry: Entry;
  score: number;
  coverage: number;
  /** False when the query has a number/version that does not occur in the entry. */
  numbersOk: boolean;
}

export interface Retrieval {
  exact?: Entry;
  candidates: Candidate[];
  hasNegation: boolean;
  /** Stemmed, stopword-free query terms. */
  terms: string[];
}

export interface SerializedEngine {
  version: 1;
  language: string;
  entries: Entry[];
  index: AsPlainObject;
}

interface Doc {
  id: string;
  title: string;
  questions: string;
  keywords: string;
  answer: string;
}

const FIELDS = ['title', 'questions', 'keywords', 'answer'] as const;
const BOOST = { questions: 3, title: 2.5, keywords: 2, answer: 0.5 };

/** Index (and search) "self-hosting" as itself and as "self" + "hosting", so "self host" finds it. Raw query tokens used for negation checks are not affected. */
function tokenizeWithParts(text: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(text)) {
    out.push(t);
    if (t.includes('-')) for (const part of t.split('-')) if (part.length >= 2) out.push(part);
  }
  return out;
}

function miniOptions(lang: LanguagePack) {
  return {
    fields: [...FIELDS],
    storeFields: [],
    tokenize: tokenizeWithParts,
    processTerm: (t: string) => (lang.negations.has(t) ? t : lang.stem(t)),
  };
}

export class Engine {
  readonly language: string;
  readonly entries: Entry[];
  readonly lang: LanguagePack;
  readonly thresholds: Thresholds;
  private readonly mini: MiniSearch<Doc>;
  private readonly byId = new Map<string, Entry>();
  private readonly parents = new Map<string, Entry>();
  private readonly exactMap = new Map<string, Entry[]>();
  private readonly termSets = new Map<string, Set<string>>();
  /** Stemmed term -> in how many entries it occurs, and one surface form to restore it from. The vocabulary the site actually uses. */
  private readonly df = new Map<string, number>();
  private readonly surface = new Map<string, string>();
  /** Raw words the site uses -> in how many entries. Typo repair compares against these, never against stems. */
  private readonly rawDf = new Map<string, number>();

  constructor(language: string, entries: Entry[], mini: MiniSearch<Doc>, thresholds: Partial<Thresholds> = {}) {
    this.language = language;
    this.entries = entries;
    this.mini = mini;
    this.lang = getLanguage(language);
    this.thresholds = { ...defaultThresholds, ...thresholds };
    for (const e of entries) {
      this.byId.set(e.id, e);
      for (const c of e.clarification?.choices ?? []) {
        const target = entries.find((x) => x.id === c.answerId);
        if (target) this.parents.set(target.id, e);
      }
      for (const q of [e.title, ...e.questions]) {
        const key = canonicalPhrase(q, this.lang);
        const list = this.exactMap.get(key) ?? [];
        if (!list.includes(e)) list.push(e);
        this.exactMap.set(key, list);
      }
      const own = new Set(indexTerms(docText(e), this.lang));
      this.termSets.set(e.id, own);
      for (const t of own) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      const words = new Set(tokenize(docText(e)));
      for (const raw of words) {
        if (!this.surface.has(this.stemOf(raw))) this.surface.set(this.stemOf(raw), raw);
        this.rawDf.set(raw, (this.rawDf.get(raw) ?? 0) + 1);
      }
    }
  }

  private stemOf(raw: string): string {
    return this.lang.negations.has(raw) ? raw : this.lang.stem(raw);
  }

  private known(raw: string): boolean {
    if (this.lang.stopwords.has(raw) || this.lang.negations.has(raw) || this.df.has(this.stemOf(raw)) || isNumeric(raw)) return true;
    // The search itself matches word beginnings ("docs" finds "documentation"), so a beginning of a site word is a real word too.
    const stem = this.stemOf(raw);
    if (raw.length >= 3) for (const word of this.rawDf.keys()) if (word.startsWith(raw) || (stem.length >= 3 && word.startsWith(stem))) return true;
    return false;
  }

  /**
   * Repairs careless typing before searching: "Doyou" -> "do you", "writeabout" -> "write about", "wokr" -> "work", "yu" -> "you".
   * Only words the site never uses are touched, and only toward words it (or the language) does use, so real vocabulary is never rewritten.
   */
  private repair(tokens: string[]): string[] {
    const out: string[] = [];
    for (const t of tokens) {
      if (t.length < 2 || this.known(t) || /\p{N}/u.test(t)) { out.push(t); continue; }
      // 1) two known words typed together
      let best: [string, string] | undefined;
      let bestScore = -1;
      for (let i = 2; i <= t.length - 2; i++) {
        const a = t.slice(0, i);
        const b = t.slice(i);
        if (!this.known(a) || !this.known(b)) continue;
        const score = Math.min(a.length, b.length) * 100 + (this.df.get(this.stemOf(a)) ?? 5) + (this.df.get(this.stemOf(b)) ?? 5);
        if (score > bestScore) { bestScore = score; best = [a, b]; }
      }
      if (best && Math.min(best[0].length, best[1].length) >= 2) { out.push(...best); continue; }
      // 2) one slip (dropped, doubled, wrong or swapped letter) away from a word the language ignores or the site uses
      let fix: string | undefined;
      for (const w of this.lang.stopwords) {
        // A one-letter slip away from a word the language ignores: "wat" -> "what", "yu" -> "you", but never "dog" -> "do".
        if (this.lang.negations.has(w) || w.length < 3) continue;
        if (w[0] === t[0] && Math.abs(w.length - t.length) <= 1 && editsWithin1(t, w)) { fix = w; break; }
      }
      // Typos keep their first letter, which also keeps "bread" from becoming "read" and "bake" from becoming "take".
      // Four-letter words are only repaired when two neighbouring letters were swapped ("wokr" -> "work").
      if (!fix && t.length >= 4) {
        let bestDf = 0;
        for (const [word, count] of this.rawDf) {
          if (count <= bestDf || word[0] !== t[0] || Math.abs(word.length - t.length) > 1) continue;
          if (t.length === 4 ? swapped(t, word) : editsWithin1(t, word)) { bestDf = count; fix = word; }
        }
      }
      out.push(fix ?? t);
    }
    return out;
  }

  get(id: string): Entry | undefined {
    return this.byId.get(id);
  }

  /** The clarification topic that lists this entry as a choice target, if any. */
  parentOf(id: string): Entry | undefined {
    return this.parents.get(id);
  }

  retrieve(query: string): Retrieval {
    const direct = this.retrieveOnce(query);
    const translit = this.lang.transliterate;
    if (!translit || !isMostlyLatin(query)) return direct;
    const alt = this.retrieveOnce(translit(query));
    if (alt.exact && !direct.exact) return alt;
    const a = alt.candidates[0];
    const d = direct.candidates[0];
    return a && (!d || a.score > d.score) && !direct.exact ? alt : direct;
  }

  private retrieveOnce(query: string): Retrieval {
    const lang = this.lang;
    let text = query;
    for (const re of lang.framePhrases ?? []) text = text.replace(re, ' ');
    const raw = this.repair(tokenize(text));
    const hasNegation = raw.some((t) => lang.negations.has(t));
    const terms = raw.filter((t) => !lang.stopwords.has(t)).map((t) => (lang.negations.has(t) ? t : lang.stem(t)));

    const exactList = this.exactMap.get(canonicalPhrase(query, lang));
    const exact = exactList?.length === 1 ? exactList[0] : undefined;

    const contentTerms = terms.filter((t) => !lang.negations.has(t));
    if (contentTerms.length === 0) return { exact, candidates: [], hasNegation, terms };

    const results = this.mini.search(contentTerms.join(' '), {
      boost: BOOST,
      prefix: (term) => term.length >= 4,
      fuzzy: (term) => (term.length >= 5 && !isNumeric(term) ? 0.2 : false),
      combineWith: 'OR',
      processTerm: (t) => t,
    });

    const numbers = contentTerms.filter(isNumeric);
    const candidates: Candidate[] = [];
    for (const r of results.slice(0, 12)) {
      const entry = this.byId.get(r.id as string);
      if (!entry) continue;
      const matched = new Set(r.queryTerms);
      const coverage = contentTerms.filter((t) => matched.has(t)).length / contentTerms.length;
      const own = this.termSets.get(entry.id) as Set<string>;
      candidates.push({ entry, score: r.score * entry.weight, coverage, numbersOk: numbers.every((n) => own.has(n)) });
    }
    candidates.sort((a, b) => b.score - a.score);
    return { exact, candidates, hasNegation, terms };
  }

  toJSON(): SerializedEngine {
    return { version: 1, language: this.language, entries: this.entries, index: this.mini.toJSON() };
  }
}

/** True when a and b differ by at most one insertion, deletion, substitution or adjacent swap. */
function editsWithin1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

function swapped(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i < a.length - 1 && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}

function isMostlyLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  return letters.filter((c) => /\p{Script=Latin}/u.test(c)).length / letters.length > 0.6;
}

function docText(e: Entry): string {
  return [e.title, ...e.questions, ...e.keywords, e.answer ?? ''].join(' ');
}

/**
 * Build-time vocabulary expansion. An entry that already uses one word of a synonym group (in its title, questions or keywords)
 * also gets the other words of that group as search keywords. Entries that never use the group are not touched, so
 * "cost" never pulls in an unrelated entry. Nothing is added to the answer text or to the entry the visitor sees.
 */
function expandKeywords(e: Entry, lang: LanguagePack): string[] {
  const groups = lang.synonyms;
  if (!groups?.length) return [];
  const own = new Set(indexTerms([e.title, ...e.questions, ...e.keywords].join(' '), lang));
  const extra = new Set<string>();
  for (const group of groups) {
    if (!group.some((w) => own.has(lang.stem(w)))) continue;
    for (const w of group) if (!own.has(lang.stem(w))) extra.add(w);
  }
  return [...extra];
}

function toDoc(e: Entry, lang: LanguagePack): Doc {
  return {
    id: e.id,
    title: e.title,
    questions: e.questions.join(' \n '),
    keywords: [...e.keywords, ...expandKeywords(e, lang)].join(' '),
    answer: e.indexAnswer ? (e.answer ?? '') : '',
  };
}

/** Build-time: index already validated entries of a single language. */
export function createEngine(entries: readonly Entry[], language: string, thresholds?: Partial<Thresholds>): Engine {
  const own = entries.filter((e) => e.language === language);
  const mini = new MiniSearch<Doc>(miniOptions(getLanguage(language)));
  const lang = getLanguage(language);
  mini.addAll(own.map((e) => toDoc(e, lang)));
  return new Engine(language, own, mini, thresholds);
}

/** Runtime: restore an engine from `Engine#toJSON()` output. */
export function loadEngine(data: SerializedEngine, thresholds?: Partial<Thresholds>): Engine {
  const mini = MiniSearch.loadJS<Doc>(data.index, miniOptions(getLanguage(data.language)));
  return new Engine(data.language, data.entries, mini, thresholds);
}
