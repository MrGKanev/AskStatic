// Benchmark the matching engine in isolation on a public intent dataset, independent of any real site.
//   node eval/bench-dataset.ts <banking77|clinc150> [--intents 75] [--k 3] [--test 12] [--seeds 3] [--engine <dir with index.ts>]
//
// A labelled-intent dataset becomes a synthetic site: every selected intent is one knowledge entry whose example
// questions are k random training utterances (an owner who wrote a few examples). Held-out utterances of the same
// intent are the visitor questions. Utterances of intents that are NOT part of the site, and CLINC's out-of-scope
// queries, are off-topic questions that must never get a confident answer.
//
// Data is read from eval/.cache (git-ignored; see the download notes in EVAL-GENERATION-PLAN.md). Datasets:
//   Banking77  CC-BY-4.0  https://github.com/PolyAI-LDN/task-specific-datasets
//   CLINC150   CC-BY-3.0  https://github.com/clinc/oos-eval
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] as string) : fallback; };
const dataset = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) ?? 'banking77';
const N = Number(flag('intents', '75'));
const K = Number(flag('k', '3'));
const TEST = Number(flag('test', '12'));
const SEEDS = Number(flag('seeds', '3'));
const engineDir = resolve(flag('engine', new URL('../src/core', import.meta.url).pathname));
const core = await import(pathToFileURL(join(engineDir, 'index.ts')).href);
const { createEngine, initialState, respond, validateKnowledge } = core;

const cache = (f: string) => readFileSync(new URL(`./.cache/${f}`, import.meta.url), 'utf8');

type Row = { text: string; intent: string };
function loadCsv(file: string): Row[] {
  return cache(file).split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
    const i = line.lastIndexOf(',');
    return { text: line.slice(0, i).replace(/^"|"$/g, '').replace(/""/g, '"'), intent: line.slice(i + 1).trim() };
  }).filter((r) => r.text.trim().length > 1);
}
let train: Row[], test: Row[], oos: string[] = [];
if (dataset === 'banking77') {
  train = loadCsv('banking77-train.csv');
  test = loadCsv('banking77-test.csv');
} else if (dataset === 'clinc150') {
  const d = JSON.parse(cache('clinc150-full.json')) as Record<string, [string, string][]>;
  const rows = (k: string) => (d[k] ?? []).map(([text, intent]) => ({ text, intent }));
  train = [...rows('train'), ...rows('val')];
  test = rows('test');
  oos = (d.oos_test ?? []).map(([t]) => t);
} else {
  console.error('dataset must be banking77 or clinc150');
  process.exit(2);
}

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = <T,>(xs: T[], r: () => number) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j] as T, a[i] as T]; } return a; };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const human = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const by = (rows: Row[]) => { const m = new Map<string, string[]>(); for (const r of rows) m.set(r.intent, [...(m.get(r.intent) ?? []), r.text]); return m; };
const trainBy = by(train);
const testBy = by(test);
const allIntents = [...trainBy.keys()].filter((i) => i !== 'oos' && (testBy.get(i)?.length ?? 0) > 0);

interface Stat { inScope: number; ok: number; topic: number; wrong: number; fallback: number; ask: number; oos: number; oosAnswered: number; oosFallback: number; oosSuggested: number }
const stats: Stat[] = [];

for (let seed = 1; seed <= SEEDS; seed++) {
  const r = rng(seed * 7919);
  const chosen = shuffle(allIntents, r).slice(0, N);
  const others = allIntents.filter((i) => !chosen.includes(i));
  const entries = chosen.map((intent) => ({
    id: slug(intent), language: 'en', title: human(intent),
    questions: shuffle(trainBy.get(intent) ?? [], r).slice(0, K), keywords: [],
    answer: `Answer for ${human(intent)}.`, sources: [], suggested: false, followUps: [],
  }));
  const kb = validateKnowledge(entries);
  if (!kb.ok) { console.error(kb.issues.slice(0, 5)); process.exit(1); }
  const engine = createEngine(kb.entries, 'en');

  const s: Stat = { inScope: 0, ok: 0, topic: 0, wrong: 0, fallback: 0, ask: 0, oos: 0, oosAnswered: 0, oosFallback: 0, oosSuggested: 0 };
  const ask = (q: string) => respond(engine, initialState(), { type: 'text', text: q }).reply;

  for (const intent of chosen) {
    for (const q of shuffle(testBy.get(intent) ?? [], r).slice(0, TEST)) {
      const reply = ask(q);
      s.inScope++;
      const id = slug(intent);
      if (reply.type === 'answer' && reply.entry.id === id) { s.ok++; s.topic++; }
      else if (reply.type === 'answer') s.wrong++;
      else if (reply.type === 'disambiguate') { s.ask++; if (reply.candidates.some((c: { id: string }) => c.id === id)) s.topic++; }
      else s.fallback++;
    }
  }
  // Off-topic: other intents' utterances (not on this site) and, for CLINC, its out-of-scope queries.
  const offTopic = [
    ...shuffle(others.flatMap((i) => (testBy.get(i) ?? []).slice(0, 2)), r).slice(0, 400),
    ...shuffle(oos, r).slice(0, 400),
  ];
  for (const q of offTopic) {
    const reply = ask(q);
    s.oos++;
    if (reply.type === 'answer') s.oosAnswered++;
    else if (reply.type === 'fallback') s.oosFallback++;
    else if (reply.type === 'disambiguate') s.oosSuggested++;
  }
  stats.push(s);
}

const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs: number[]) => (Math.max(...xs) - Math.min(...xs)) / 2;
const col = (f: (s: Stat) => number) => { const xs = stats.map(f); return `${mean(xs).toFixed(1)} +/-${spread(xs).toFixed(1)}`; };

console.log(`engine: ${engineDir.replace(process.cwd(), '.')}`);
console.log(`${dataset}: ${N} intents as one site, ${K} example questions each, up to ${TEST} test utterances per intent, ${SEEDS} seeds`);
console.log(`in-scope questions per seed: ${stats[0]?.inScope}, off-topic questions per seed: ${stats[0]?.oos}`);
console.log(`  answered correctly        ${col((s) => pct(s.ok, s.inScope))} %`);
console.log(`  right topic (answer or "did you mean")  ${col((s) => pct(s.topic, s.inScope))} %`);
console.log(`  confidently wrong         ${col((s) => pct(s.wrong, s.inScope))} %   (of all in-scope questions)`);
console.log(`  asked "did you mean"      ${col((s) => pct(s.ask, s.inScope))} %`);
console.log(`  fell back to site search  ${col((s) => pct(s.fallback, s.inScope))} %`);
console.log(`  precision when it answers ${col((s) => pct(s.ok, s.ok + s.wrong))} %`);
console.log(`  off-topic answered confidently (false accept)  ${col((s) => pct(s.oosAnswered, s.oos))} %`);
console.log(`  off-topic correctly fell back                  ${col((s) => pct(s.oosFallback, s.oos))} %`);
console.log(`  off-topic got a "did you mean" suggestion       ${col((s) => pct(s.oosSuggested, s.oos))} %`);
