# AskStatic — Astro integration: action plan

Language of the deliverable: **English** (code, comments, docs, README, error messages, default UI strings, npm metadata). The Bulgarian research doc stays as internal background. Bulgarian is a supported *content* language (i18n pack), not the package language.

## 0. Status (updated 2026-10-10)

Decisions taken by default (change any of them): name `astro-integration-askstatic` (npm availability **not checked**), MIT, EN + BG, monorepo (`packages/core`, `packages/astro`, `demo/`), AI authoring CLI out of v0.1.

| Phase | State |
|---|---|
| 0 Setup | Done, except CI config and lint/changesets (not added) |
| 1 Core engine | Done: schema, validator, tokenizer, MiniSearch retrieval, resolver, conversation state. 23 tests |
| 2 Integration | Done: options, YAML/JSON loader, hashed pack, Pagefind step, link check, dev-server route, 7 tests |
| 3 Widget | Built and manually verified in Chrome (open, ask, clarify, sources, back/reset, Pagefind fallback, EN + BG). **No automated browser tests yet**; screen-reader and real-phone checks not done |
| 4 Languages | EN, BG, Latin-typed BG. Pagefind quality on Bulgarian only spot-checked (a weak match was seen) |
| 5 Quality | Size script `scripts/check-size.mjs` (demo: 5.6 KB gz on every page, 12.1 KB gz on first open). Not run in CI; no memory/phone measurements; no formal security review |
| 6 Docs/release | README + LICENSE written. Not published; no docs site |

Eval (`pnpm eval`): EN 49/56, BG 36/39, 0 confident-wrong answers. These sets were written by the same author as the demo knowledge and the knowledge bases are tiny, so the numbers are optimistic. The real test is a real site with real visitor questions.

Known gaps: no CI; Astro versions other than 7.3.8 untested; Pagefind fallback can return weak matches; widget has no automated a11y/E2E tests.

## To-do (agreed 2026-10-11)

Not started, in the order we want to do them. Details in `ONBOARDING-PLAN.md`.

1. **Feedback loop for unanswered questions.** Capture questions that fell back or had low confidence (local by default, owner webhook as an opt-in), review them with a command, and turn a reviewed question into a new example question or entry in one step. This is what makes the vocabulary grow from real visitors instead of from guesses.
2. **Offline LLM authoring helper (local script, never part of the site).** A command run by hand (e.g. `askstatic suggest`) that talks to a local model (Ollama) or an API key the owner provides and only *proposes*: new entries from site content, paraphrased example questions, synonym candidates, eval questions. Every proposal is reviewed and approved by a human before it is written; nothing is sent anywhere without a dry-run; unchanged pages are skipped by content hash. It cannot be fully unattended: answers are statements about the owner's business (prices, availability), and a model may invent them.
3. **Real eval set.** Replace the author-written questions (`gkanev.com/src/askstatic/_eval/en.json`, `packages/astro/eval/`) with real visitor questions collected via item 1, and gate CI on it.
4. **Cloudflare `Did you mean` quality, Bulgarian Pagefind quality, phone/screen-reader checks** (see Known gaps).

## Matching quality (2026-10-11)

Full study, method, rejected ideas and remaining miss types: `MATCHING-RESEARCH.md`. Latest: A 81.6% to 91.8%, held-out B 70.0% to 78.6%, confident-wrong 0 everywhere. Earlier note: **81.6% to 87.8% correct**, confident-wrong answers **2 to 0**, demo EN eval unchanged at 49/56, BG at 36/39. Changes: question-frame words (`kind`, `have`, `write`, ...) no longer count against coverage; a consistent stemmer (`price/pricing`, `code/coding`, possessives); build-time synonym groups applied only to entries that already use a word of the group; short topic queries offer "did you mean" (gap 0.35, chosen by measurement: 0.25 to 0.35 scored the same, 0.45 was worse); the site-search fallback searches the meaningful words and keeps only results with a real match. Run it: `node packages/astro/eval/run-site.ts <knowledgeDir> <questions.json>`.

## 1. Verified facts (checked 2026-10-10)

| Item | Finding |
|---|---|
| Astro | latest 7.3.8, Node `>=22.12.0`, Vite 8 |
| Integration API | hooks `astro:config:setup`, `astro:config:done`, `astro:server:setup`, `astro:build:done`; `updateConfig`, `injectScript`, `injectRoute`, `injectTypes`, `createCodegenDir`, `AstroIntegrationLogger` |
| Publishing | name `astro-integration-*`, keywords `astro-integration` + `withastro`, `astro` as `peerDependency`, no build step needed for `.astro`/`.ts` |
| Pagefind | 1.5.2; Node API `createIndex → addDirectory / addCustomRecord → writeFiles` runs after the Astro build |
| MiniSearch | 7.2.0, MIT, zero deps; fuzzy, prefix, field boost, `autoSuggest`, JSON (de)serialisation |
| Not verified | Exact Astro 7 hook signatures (read the 7.x reference before coding), Pagefind stemming/segmentation for Bulgarian, npm name availability, `astro-integration-kit` status (page returned 403) |

## 2. Product definition

An Astro integration that, at **build time**, turns site content into a static knowledge pack and, at **runtime**, gives visitors a small chat widget that answers from it. No server, DB, LLM or API calls.

User-facing API (target):

```js
// astro.config.mjs
import askstatic from 'astro-integration-askstatic';
export default defineConfig({
  integrations: [askstatic({ knowledge: 'src/askstatic', languages: ['en', 'bg'], pagefind: true })],
});
```
```astro
---
import AskStatic from 'astro-integration-askstatic/component';
---
<AskStatic />
```

Non-goals for v1: LLM/embeddings, visual flow editor, analytics backend, AI authoring command (kept as v2 CLI).

## 3. Architecture decisions

1. **Monorepo, two packages**
   - `packages/astro/src/core` (one published package, no separate core package) — pure TS, no Astro/DOM deps: schema (zod), normalize, tokenizer, retrieve, resolve (decision table from the research doc), conversation state. Unit-testable in Node.
   - `packages/astro` — the integration + `<AskStatic />` component + custom element client.
   - `demo/` — real Astro site (EN + BG content) used for tests and measurements.
2. **Knowledge source**: files in `src/askstatic/` (YAML/JSON/Markdown frontmatter), validated at build. No dependency on content collections (works for every site); optional adapter later.
3. **Build pipeline** (inside the integration):
   - `astro:config:setup` — load + validate knowledge, register virtual module for options, `injectTypes`.
   - `astro:build:done` — write hashed MiniSearch index + answers JSON to `dist/_askstatic/`; run Pagefind Node API on `dist/` (+ custom records for FAQ if useful); emit a build report (unanswered topics, broken source links, duplicate ids).
   - `astro:server:setup` — serve the same pack in dev (Pagefind fallback disabled in dev with a clear message).
4. **Client**: vanilla custom element `<ask-static>`, lazy `import()` of engine + index only on first open; no framework; styling via CSS variables, Shadow DOM optional; all text rendered with `textContent` (no `innerHTML`); links restricted to same-origin/allow-listed.
5. **Base path / i18n**: every URL goes through one `resolveUrl()` honouring Astro `base` and locale routes.
6. **Language handling**: Unicode normalisation + `\p{L}\p{N}` tokenizer; per-language pack (stopwords **not** blindly removed — negations kept; light suffix handling for BG definite articles; optional Latin↔Cyrillic transliteration as a second search channel). Packs are pluggable.
7. **Retrieval**: FAQ via MiniSearch first, Pagefind as fallback; scores never mixed (as in the research doc). Thresholds tuned on the eval set, exposed as options.

## 4. Phases

### Phase 0 — Setup (0.5 day)
- Decide name/licence (see §6); check npm + GitHub availability.
- Scaffold pnpm workspace, TypeScript, Vitest, Biome/ESLint, changesets, CI (build + test on Node 22).
- Read Astro 7 integration reference and write down real hook signatures.
**Done when:** empty integration installs into `demo/` and logs from each hook.

### Phase 1 — Core engine (3–4 days)
- Knowledge schema + validator (duplicate ids, missing `answerId`, dead transitions, missing sources).
- Normalize/tokenize, MiniSearch wrapper, serialisation round-trip.
- Resolver: answer / clarify / disambiguate / fallback; conversation state (topic, known fields, pending clarification, back, "other topic", max 2 failed clarifications).
**Done when:** Vitest suite passes, incl. negation/number/version cases and a first 50-question EN eval set run from a script that prints precision and wrong-confident-answer count.

### Phase 2 — Astro integration + build output (3 days)
- Options with zod validation and good error messages.
- Knowledge loader, hashed output files, virtual module, dev-server route, type injection.
- Pagefind step in `astro:build:done` with root/exclude selectors, `base` support, and graceful skip when not installed.
- Build report.
**Done when:** `astro build` on `demo/` produces `dist/_askstatic/*` and `dist/pagefind/*`, and the report catches deliberately broken data.

### Phase 3 — Widget (3–4 days)
- Custom element: launcher, panel, message list, suggestion chips, clarification buttons, source links, "back"/"other topic".
- Lazy loading, `sessionStorage` history (optional), reduced-motion, dark mode via CSS variables, theming docs.
- Accessibility: focus trap/return, `aria-live` log, keyboard-only flow, screen-reader pass, 320 px layout.
**Done when:** Playwright tests cover open → ask → clarify → answer → source link, plus fallback to Pagefind results.

### Phase 4 — Languages (2 days)
- English pack, Bulgarian pack (articles, translit channel), pack API for others.
- BG eval set of 50+ questions incl. typos, Latin-typed Bulgarian, definite forms.
- Verify Pagefind behaviour on Bulgarian content; document limits.
**Done when:** both eval sets meet the agreed targets (proposal: ≥85% correct-or-clarified, ≤2% confident-wrong).

### Phase 5 — Quality and performance (2 days)
- Size budget in CI: <1 MB compressed on first chat open for the demo (the target from the research doc), nothing loaded before open.
- Memory + timing on a real phone; Lighthouse before/after to prove no impact on page load.
- Security review: XSS (text rendering, URL allow-list), no secrets in the public pack.
**Done when:** budgets are enforced by a CI check.

### Phase 6 — Docs and release (2 days)
- README, quick start, knowledge format reference, options reference, i18n guide, troubleshooting, a live demo site.
- Package metadata (`astro-integration`, `withastro` keywords, `astro` peer dep, `exports`, `files`), changelog, `v0.1.0` to npm.
- Submit for the Astro integrations directory.

### Later (v2)
Optional AI-assisted authoring CLI (`askstatic suggest`, hash-based diff, human approval), page-aware suggestions, auto-selected clarification field, content-collection adapter, editor, non-Astro embed script.

Estimated total for v0.1: ~16–18 working days by one developer.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Hook APIs differ in Astro 7 from older docs | Phase 0 reading + pin a minimum version, test in CI against min and latest |
| Free-text matching is weak without a model | Honest fallback to links; eval set drives thresholds; synonym/example authoring guidance in docs |
| Bulgarian morphology | Light suffix rules + fuzzy + examples; measured in BG eval set |
| Pagefind quality for Bulgarian unknown | Test in Phase 4; FAQ path works without it |
| Authoring cost of knowledge files | Build report for gaps; AI-assisted authoring in v2 |
| Name collision (npm/trademark) | Check in Phase 0 before publishing |

## 6. Decisions needed from you

1. Package name: `astro-integration-askstatic` or something else?
2. Licence (MIT suggested) and whether the repo is public from day one.
3. Languages in v0.1: EN + BG only?
4. Monorepo (core + astro) vs a single package?
5. Is the AI-assisted authoring CLI definitely out of v0.1?
