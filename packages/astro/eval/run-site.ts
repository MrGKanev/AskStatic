// Evaluate a real site's knowledge folder: node eval/run-site.ts <knowledgeDir> <questions.json> [lang] [--json]
//   questions.json: [{ "q": "...", "expect": "answer|topic|clarify|fallback|guarded|any", "id": "entry-id" | ["id", ...] }]
//   answer   - must answer with one of `id`
//   topic    - answering with one of `id`, or asking "did you mean" with one of them among the candidates, both count
//   fallback - must not answer (a link search instead)
//   guarded  - must not give a confident answer (negations, numbers); confirmation or fallback are fine
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, initialState, respond, validateKnowledge } from '../src/core/index.ts';
import { loadKnowledge } from '../src/knowledge.ts';

type Expect = 'answer' | 'topic' | 'clarify' | 'fallback' | 'guarded' | 'any';
interface Q { q: string; expect: Expect; id?: string | string[]; type?: string; source?: string }

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const [dir, questionsFile, lang = 'en'] = args;
if (!dir || !questionsFile) { console.error('usage: node eval/run-site.ts <knowledgeDir> <questions.json> [lang] [--json]'); process.exit(2); }

const loaded = await loadKnowledge(resolve(dir), process.cwd());
const kb = validateKnowledge(loaded.items);
if (!kb.ok) { console.error(kb.issues); process.exit(1); }
const engine = createEngine(kb.entries, lang);
const questions: Q[] = JSON.parse(readFileSync(resolve(questionsFile), 'utf8'));

const rows = questions.map(({ q, expect, id, type, source }) => {
  const ids = id === undefined ? [] : Array.isArray(id) ? id : [id];
  const { reply } = respond(engine, initialState(), { type: 'text', text: q });
  const got = reply.type === 'answer' ? `answer:${reply.entry.id}` : reply.type === 'clarify' ? `clarify:${reply.entry.id}` : reply.type === 'disambiguate' ? `disambiguate:${reply.candidates.map((c) => c.id).join('|')}` : reply.type === 'fallback' ? 'fallback' : reply.type;
  const answered = reply.type === 'answer' || reply.type === 'clarify';
  const answeredId = reply.type === 'answer' || reply.type === 'clarify' ? reply.entry.id : undefined;
  const candidateIds = reply.type === 'disambiguate' ? reply.candidates.map((c) => c.id) : [];
  let ok: boolean;
  switch (expect) {
    case 'answer': ok = answeredId !== undefined && ids.includes(answeredId); break;
    case 'clarify': ok = reply.type === 'clarify' && ids.includes(reply.entry.id); break;
    case 'topic': ok = (answeredId !== undefined && ids.includes(answeredId)) || candidateIds.some((c) => ids.includes(c)); break;
    case 'fallback': ok = reply.type === 'fallback'; break;
    case 'guarded': ok = !answered; break;
    default: ok = true;
  }
  const wantsAnswer = expect === 'answer' || expect === 'topic' || expect === 'clarify';
  const confidentWrong = answered && expect !== 'any' && !ok;
  const missed = wantsAnswer && !ok && !answered; // fell back or asked "did you mean" without the right candidate
  return { q, expect, ids, got, ok, confidentWrong, missed, type, source };
});

const total = rows.length;
const correct = rows.filter((r) => r.ok).length;
const wrong = rows.filter((r) => r.confidentWrong).length;
const missed = rows.filter((r) => r.missed).length;
const answerable = rows.filter((r) => ['answer', 'topic', 'clarify'].includes(r.expect));
const answerableOk = answerable.filter((r) => r.ok).length;
const summary = { total, correct, pct: +((100 * correct) / total).toFixed(1), confidentWrong: wrong, missedAnswerable: missed, answerable: answerable.length, answerableOk };

const askRows = rows.filter((r) => ['answer', 'topic', 'clarify'].includes(r.expect));
const offeredRight = askRows.filter((r) => !r.ok && r.got.startsWith('disambiguate') && r.ids.some((i) => r.got.includes(i))).length;
const deadEnd = askRows.filter((r) => r.got === 'fallback').length;
const falseSuggest = rows.filter((r) => r.expect === 'fallback' && r.got.startsWith('disambiguate')).length;
const fbRows = rows.filter((r) => r.expect === 'fallback').length;
const rightAnswers = askRows.filter((r) => r.ok && r.got.startsWith('answer')).length;
if (asJson) console.log(JSON.stringify({ summary, failures: rows.filter((r) => !r.ok) }, null, 2));
else {
  console.log(`[${lang}] ${total} questions | correct ${correct} (${summary.pct}%) | answerable ${answerableOk}/${answerable.length} | confident-wrong ${wrong} | missed ${missed}`);
  console.log(`  of ${askRows.length} answerable questions: answered right ${rightAnswers} | offered the right entry as "did you mean" ${offeredRight} | dead end ${deadEnd} | confidently wrong ${wrong}  ||  of ${fbRows} off-topic: suggested something ${falseSuggest}`);
  for (const r of rows.filter((x) => !x.ok)) console.log(`  ${r.confidentWrong ? 'WRONG ' : 'MISS  '} "${r.q}" -> ${r.got}  (want ${r.expect}${r.ids.length ? ':' + r.ids.join('|') : ''})`);
}
// Breakdown by question type, when the rows carry one (generated sets do).
if (!asJson && rows.some((r) => r.type)) {
  const types = [...new Set(rows.map((r) => r.type ?? '(none)'))].sort();
  console.log(`\n${'type'.padEnd(12)} ${'n'.padStart(4)} ${'correct'.padStart(8)} ${'wrong'.padStart(6)} ${'missed'.padStart(7)}`);
  for (const t of types) {
    const g = rows.filter((r) => (r.type ?? '(none)') === t);
    const ok = g.filter((r) => r.ok).length;
    console.log(`${t.padEnd(12)} ${String(g.length).padStart(4)} ${((100 * ok) / g.length).toFixed(0).padStart(7)}% ${String(g.filter((r) => r.confidentWrong).length).padStart(6)} ${String(g.filter((r) => r.missed).length).padStart(7)}`);
  }
}
process.exitCode = wrong > 1 ? 1 : 0;
