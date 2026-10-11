// Turns generated questions + blind judge labels into an eval file for run-site.ts.
//   node eval/merge-generated.ts <generated.json> <judge-out-1.jsonl> [<judge-out-2.jsonl> ...] --out <eval.json>
// generated.json rows: { n, id (the entry the generator wrote the question for), type, persona, q }
// judge rows:          { n, answers: [ids the judge says answer it], ok_to_answer, reason }   (the judge never sees `id`)
//
// Labelling rules (the engine is never consulted, so the labels cannot be inflated by it):
//   judge agrees with the generator and names exactly that entry and says it is fine to answer  -> expect answer, conf high
//   judge names that entry but also others, or says it needs a clarification                    -> expect topic (answer or "did you mean" with the right entry), conf high
//   judge names other entries only (disagrees with the generator)                               -> expect topic with the judge's entries, conf low
//   judge says no entry answers it                                                               -> dropped (counted in the report)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const out = outIdx >= 0 ? (argv[outIdx + 1] as string) : '';
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
const [genFile, ...judgeFiles] = files;
if (!genFile || !judgeFiles.length || !out) { console.error('usage: merge-generated.ts <generated.json> <judge.jsonl>... --out <eval.json>'); process.exit(2); }

type Gen = { n: number; id: string; type: string; persona: string; q: string };
type Judge = { n: number; answers: string[]; ok_to_answer: boolean; reason?: string };
const gen: Gen[] = JSON.parse(readFileSync(resolve(genFile), 'utf8'));
const judged = new Map<number, Judge>();
for (const f of judgeFiles) for (const line of readFileSync(resolve(f), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { const j = JSON.parse(line) as Judge; judged.set(j.n, j); } catch { /* ignore a broken line */ }
}

const rows: Record<string, unknown>[] = [];
let missingJudge = 0, dropped = 0, agree = 0, disagree = 0;
for (const g of gen) {
  const j = judged.get(g.n);
  if (!j) { missingJudge++; continue; }
  if (!j.answers.length) { dropped++; continue; }
  const mine = j.answers.includes(g.id);
  if (mine && j.answers.length === 1 && j.ok_to_answer && g.type !== 'negation' && g.type !== 'vague' && g.type !== 'multi') {
    rows.push({ q: g.q, expect: 'answer', id: [g.id], type: g.type, persona: g.persona, source: 'gen', conf: 'high' }); agree++;
  } else if (mine) {
    rows.push({ q: g.q, expect: 'topic', id: j.answers, type: g.type, persona: g.persona, source: 'gen', conf: 'high' }); agree++;
  } else {
    rows.push({ q: g.q, expect: 'topic', id: j.answers, type: g.type, persona: g.persona, source: 'gen', conf: 'low', from: g.id }); disagree++;
  }
}
writeFileSync(resolve(out), JSON.stringify(rows, null, 1));
console.log(`generated ${gen.length} | no judge label ${missingJudge} | judge says nothing answers it (dropped) ${dropped} | judge agrees ${agree} | judge disagrees ${disagree} | written ${rows.length} -> ${out}`);
