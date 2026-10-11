# Matching quality: how we catch the misses

Date: 2026-10-11. All numbers come from `packages/astro/eval/run-site.ts` run on the real `gkanev.com` knowledge (93 entries), plus the demo evals (`pnpm eval`).

## Method (so the numbers mean something)

- **Set A** (98 questions) was written first and used to find problems. Because the same person wrote the knowledge and the questions, A is optimistic and was partly tuned against.
- **Set B** (70 questions) was written afterwards with fresh phrasings and never used to design a fix. It is the honest generalisation number.
- Every candidate change was measured on A, B and the two demo evals (EN 56, BG 39). The hard rule: **confident-wrong answers must stay 0**. A change that raised a score but created a wrong confident answer was rejected.
- Expectations: `answer` (one of these ids), `topic` (the right id answered, or offered in "did you mean"), `fallback`, `guarded` (must not answer confidently).
- Files: `gkanev.com/src/askstatic/_eval/en.json` (A), `en.heldout.json` (B). Run: `node packages/astro/eval/run-site.ts <knowledgeDir> <questions.json> en`.
- Honest note on expectation changes: when generated entries (LinkedIn, books, uses, ...) were added, a few expectations were widened because the new entry is an equally valid or better answer ("what laptop do you use" now answers with the exact devices), and five pairs where "did you mean" lists two correct candidates were moved from `answer` to `topic`. Nothing was relaxed to hide a wrong answer.

## Result

| | Start | Now |
|---|---|---|
| A, correct | 80/98 (81.6%) | 90/98 (91.8%) |
| B, correct | 49/70 (70.0%) | 58/70 (82.9%) |
| Confident-wrong (A, B, demo EN, demo BG) | 2, 1, 0, 0 | **0, 0, 0, 0** |
| Demo EN / BG | 49/56, 36/39 | 49/56, 36/39 |

## What each miss turned out to be

The first 12 misses on A had several different causes, which is why one trick cannot fix them all.

| Cause | Examples | What catches it | Status |
|---|---|---|---|
| **Tokenizer bug** | "40k" was cut into `4` and `0k` | A number followed by letters stays one token | Fixed |
| **Question frame diluting coverage** | "what kind of consulting do you do" | Frame words (`kind`, `have`, `write`, `take`) ignored when measuring coverage | Fixed |
| **Vocabulary the entry never used** | fees/charge/quote, doctorate/PhD, smartphone/phone, ChatGPT/AI | Build-time synonym groups, applied only to entries that already use a word of the group | Fixed for common groups; the long tail needs data |
| **Stemmer disagreement** | `code`/`coding`, `price`/`pricing`, `Cloudflare's`/`cloudflare`, `self-hosting`/`self host` | Consistent final-e rule, possessives, hyphenated words indexed as themselves and as parts | Fixed |
| **Generated entries outranking hand-written ones** | "which phone do you have", "open source plugins" | `weight` field (0.7 for generated entries) | Fixed |
| **Long generated lists matching on incidental words** | "what os do you run on your laptop" matched "Home Assistant OS" in the homelab list | `indexAnswer: false`: the entry is found through title, questions and keywords only | Fixed |
| **Negation guard too strict** | "a codebase with no docs", "requests and no priorities" | Look past a negation only when it describes a situation (`with/and/but no`) **and** one entry dominates (4x score, 0.7 coverage). "does it not collect data" stays guarded | Fixed |
| **Real ambiguity** | "which languages do you speak" (languages vs speaking), "fees" (pricing vs sponsoring), "books" | Offer "did you mean". Not a bug | By design |
| **Multi-intent** | "send you money to support your open source" | Needs clause splitting or a second question | Open |

## What did not work (measured, rejected)

| Idea | Why it looked good | Result |
|---|---|---|
| IDF-weighted coverage (rare words count more) | Standard retrieval practice | A -3, B -4. **Removed.** One accidental rare word decided too often |
| "Known vs unknown word" coverage: an unmatched word the site never saw counts fully, a word it uses somewhere counts half | Should separate everyday language from off-topic | No gain at 1.0/0.85/0.7; worse at 0.5 and it created a confident-wrong. **Removed** |
| Wider "did you mean" gap for short queries | Cloudflare had two matching posts | 0.25 to 0.35 scored the same, 0.45 was worse. Kept 0.35. The Cloudflare case was really a possessive-token bug |
| Relaxing the negation guard for any dominant entry | +2 on A | Broke two unit tests and created 3 confident-wrong answers in the demo. Narrowed to situation phrases |
| `server/servers` in the homelab synonym group | Seemed natural | The hosting entry also uses "servers" and got pulled in. Lesson: keep synonym groups small and specific |
| Generated entries at weight 0.85, then 1 | Fewer "did you mean" prompts | Eval dropped to A 83.7% with 3 confident-wrong. Weight 0.7 plus `indexAnswer: false` plus narrower keywords fixed it |

## Connecting the chat to the site's own data (2026-10-11)

Instead of hand-copying text, `gkanev.com/scripts/askstatic-data.mjs` generates entries from the data the site already has: LinkedIn (current job, past roles, education, certifications, skills), Google Scholar (publications), the Goodreads cache (books), the `uses` page (hardware, homelab, software, hosting), the projects and speaking pages, and the package download stats of the last build. One command refreshes all of it: `pnpm chat:refresh` (build, regenerate, build; `--fast` reuses the last data). Hand-written entries link to the generated ones with `followUps`, so "what is in your homelab" answers with the story and offers the hardware list. LinkedIn is the only source that cannot refresh itself: drop a new export into `exports/`.

## What is left, and how to catch it

Remaining B misses are mostly questions whose key word is simply unknown to the knowledge: "what's the damage" (slang for price), "minimum engagement", "local LLMs", "contacted by teammates". More rules do not help; more words do. Sources of words, cheapest first:

1. **Real visitor questions** (feedback loop, on the to-do list). Every unanswered question is a labelled gap, neither guessed nor biased by the author.
2. **An offline LLM helper** (on the to-do list) that proposes paraphrases, synonyms and new entries for a human to approve. Good for vocabulary, not trusted for facts.
3. **Generated eval sets** to measure all of this without a human author: see `EVAL-GENERATION-PLAN.md`.
4. **Shared synonym packs per language**, grown from the above and checked against the evals. Keep groups small.

## More example types to test

- Slang and idioms for money ("what's the damage", "ballpark")
- Availability and scheduling ("are you free next month", "can we hop on a call")
- Questions about the person ("did you finish your PhD")
- Comparisons ("X vs Y")
- Typos and missing letters
- Very short queries ("pricing", "contact", "cv")
- Messages that state a problem instead of asking ("my checkout is slow", "we got hacked")
- Off-topic and abuse, which must fall back and never answer

## Limits of this study

- 168 questions, all written by the same author as the knowledge. Real traffic will behave differently.
- English only. Bulgarian was only protected against regressions (demo BG 36/39), not studied.
- The widget fallback and the denser UI were checked by browser tests, not measured for quality.

## Pilot: independent and generated evals (2026-10-11)

Because the hand-written sets (A, B) are biased, three independent measurements were added. Tools: `packages/astro/eval/bench-dataset.ts`, `make-deterministic.ts`, `merge-generated.ts`, prompts in `eval/prompts/`; plan and dataset survey in `EVAL-GENERATION-PLAN.md`.

| Measurement | What it is | Result with the engine of 0.1.3 | Now |
|---|---|---|---|
| A (human) | 98 questions written with the knowledge | 91.8% | 91.8% |
| B (human, held out) | 70 questions | 81.4% | 80.0% |
| Demo EN / BG | 56 / 39 questions | 49 / 36 | 49 / 36 |
| Deterministic, 302 rows | typos, missing spaces, shouting, filler, off-topic, injection (no LLM) | 79.5% | 93.4% |
| **Generated, blind-judged, 797 rows** | 6 sonnet agents wrote visitor questions from topic + one-line gist only (no example questions); 4 opus agents labelled which entries answer them without knowing the intended one; 12 question types, 14 personas | **28.7%** (answered or offered right) | **43.8%** (answered right 226, offered right 106, dead end 187, confidently wrong 43) |
| CLINC150 as a 75-entry site (3 example questions each, 3 seeds) | public intent dataset, independent of this project | answered right 30.4%, right topic 34.1%, confidently wrong 2.8% | 33.4%, 60.4%, 3.9%. Off-topic queries that get a "did you mean": 1.3% to 13.8% |
| Banking77 as a 50-entry site | same idea, finer-grained intents | answered right 32.3%, right topic 46.5% | 34.0%, 50.2% (before the suggestion feature) |

What this shows:

1. **The hand-written sets overstated quality by a wide margin.** A fair estimate on diverse, verbose, blind-written questions is about 30% answered right (44% counting a correct "did you mean"), not 90%. Real traffic on a small site is probably shorter and closer to the middle, but nobody has measured it; collecting real questions (feedback loop on the to-do list) is the only way to know.
2. **Ranking is better than the decision layer.** The right entry is first for 63% and in the first three for 84% of the generated questions, while the old thresholds turned most of those into dead ends. Two changes address it without lowering precision much: the coverage bar falls for long messages (needs 3 matching words and a clear lead), and when unsure the chat offers the best matches as "did you mean" instead of a dead end.
3. **Cheap, general repairs matter a lot for careless typing**: splitting words typed together ("Doyou", "writeabout"), fixing one-letter slips by the site's vocabulary and the language's filler words ("wokr", "yu", "abotu"), and ignoring greetings and thanks. They moved the deterministic set from 79.5% to 93.4% and did not hurt the human or independent sets.
4. **Costs, stated plainly:** confidently wrong answers on the generated set went from 32 to 43 of 797 (5.4%); on CLINC from 2.8% to 3.9% (a little over one point); and 14% of off-topic queries on CLINC (2 of 30 in the deterministic set) now get a "did you mean" suggestion that is not relevant. The thresholds `longQueryFloor` and `suggestUnsure` are exposed in the `thresholds` option so a site can trade recall for caution.
5. **Remaining weak types** on the generated set: long messages (23%), polite wrappers (29%), slang (30%), comparisons (34%), numbers (34%). These need vocabulary, which the feedback loop and the offline LLM helper are meant to provide.

Rejected during the pilot (measured): treating every near-miss word as a typo (it turned "bread" into "read", "joke" into "job", "bake" into "take", "dog" into "do", "docs" into "does"), which is why repairs require the same first letter, a word of at least five letters (four only for a swap of neighbouring letters), and never touch a word the site already uses or starts.

Limits: the generated set was labelled by models, not people (4 of 835 rows were dropped because the judge found no answering entry; the judge disagreed with the generator on 34); it was used as a development set here, so a frozen test set with a different seed and different personas is still to be generated before any claim is made; English only; judge and generator agree more often than two humans would.
