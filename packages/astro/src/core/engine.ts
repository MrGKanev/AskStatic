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
}

export const defaultThresholds: Thresholds = { minCoverage: 0.6, minScore: 2, gap: 0.25, maxCandidates: 3 };

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

function miniOptions(lang: LanguagePack) {
  return {
    fields: [...FIELDS],
    storeFields: [],
    tokenize,
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
      this.termSets.set(e.id, new Set(indexTerms(docText(e), this.lang)));
    }
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
    const raw = tokenize(query);
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
      candidates.push({ entry, score: r.score, coverage, numbersOk: numbers.every((n) => own.has(n)) });
    }
    return { exact, candidates, hasNegation, terms };
  }

  toJSON(): SerializedEngine {
    return { version: 1, language: this.language, entries: this.entries, index: this.mini.toJSON() };
  }
}

function isMostlyLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  return letters.filter((c) => /\p{Script=Latin}/u.test(c)).length / letters.length > 0.6;
}

function docText(e: Entry): string {
  return [e.title, ...e.questions, ...e.keywords, e.answer ?? ''].join(' ');
}

function toDoc(e: Entry): Doc {
  return {
    id: e.id,
    title: e.title,
    questions: e.questions.join(' \n '),
    keywords: e.keywords.join(' '),
    answer: e.answer ?? '',
  };
}

/** Build-time: index already validated entries of a single language. */
export function createEngine(entries: readonly Entry[], language: string, thresholds?: Partial<Thresholds>): Engine {
  const own = entries.filter((e) => e.language === language);
  const mini = new MiniSearch<Doc>(miniOptions(getLanguage(language)));
  mini.addAll(own.map(toDoc));
  return new Engine(language, own, mini, thresholds);
}

/** Runtime: restore an engine from `Engine#toJSON()` output. */
export function loadEngine(data: SerializedEngine, thresholds?: Partial<Thresholds>): Engine {
  const mini = MiniSearch.loadJS<Doc>(data.index, miniOptions(getLanguage(data.language)));
  return new Engine(data.language, data.entries, mini, thresholds);
}
