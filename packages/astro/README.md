# astro-integration-askstatic

A small chat widget for Astro sites that answers visitors' questions **without a server, database, API or language model**. Everything is generated at build time; in the browser it is plain search plus a few rules.

- Answers with links to the source pages
- Asks one clarifying question when the answer depends on a detail (platform, plan, …)
- Falls back to full-site [Pagefind](https://pagefind.app/) results when there is no good match
- English and Bulgarian built in (including Latin-typed Bulgarian); other languages via language packs
- Nothing is loaded until the chat is opened (except a ~6 KB gzipped widget shell)

> **Status: 0.x, pre-release.** Developed and tested against Astro 7.3 and Node 22+. The `astro` peer range is wider than what has been tested.

## Install

```sh
npm i astro-integration-askstatic
npm i -D pagefind   # optional: enables the full-site search fallback
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import askstatic from 'astro-integration-askstatic';

export default defineConfig({
  integrations: [askstatic({ languages: ['en'] })],
});
```

```astro
---
import AskStatic from 'astro-integration-askstatic/component';
---
<AskStatic />
```

Put the component in a layout. It marks itself `data-pagefind-ignore`.

## Write knowledge

Add YAML or JSON files under `src/askstatic/` (a file may hold one entry or a list; files starting with `_` or `.` are ignored).

```yaml
- id: pricing
  language: en
  title: Pricing
  suggested: true                # shown as a starter chip
  questions: ["How much does it cost?", "Is there a free plan?"]
  keywords: [price, cost, billing]
  answer: There is a free plan. Paid plans start at $9 per month.
  sources: [{ title: Pricing, url: /pricing/ }]
  followUps: [refunds]

- id: installation              # a topic with a clarifying question has no answer of its own
  language: en
  title: Installation
  questions: ["How do I install it?"]
  clarification:
    field: platform
    question: Which platform is your site built on?
    choices:
      - { label: Astro, value: astro, answerId: installation-astro }
      - { label: WordPress, value: wordpress, answerId: installation-wordpress, aliases: [wp] }
```

Rules the build enforces: ids are unique **per language**; every `answerId`/`followUps` id must exist in the same language; no clarification cycles; sources are site paths (`/docs/x/`) or http(s) URLs. Internal source links are checked against the built pages. Errors fail the build; warnings (missing sources, duplicate questions, broken links) are printed, and fail the build with `strict: true`.

Tips: the example `questions` are the strongest matching signal. Write real phrasings your visitors use, including synonyms. A question that matches nothing falls back to site search, never to a guess.

## Options

| Option | Default | |
|---|---|---|
| `knowledge` | `'src/askstatic'` | Folder with knowledge files |
| `languages` | all found | Languages to build |
| `defaultLanguage` | `'en'` | Used when the page language has no knowledge |
| `pagefind` | `true` | `false`, or `{ rootSelector, excludeSelectors }`. Skipped with a warning if `pagefind` isn't installed |
| `outputDir` | `'_askstatic'` | Folder inside the build output |
| `thresholds` | | `{ minCoverage, minScore, gap, maxCandidates }` — tune answer/clarify/fallback decisions |
| `strict` | `false` | Fail the build on warnings |

Component props: `lang`, `title`, `labels` (override any UI string). Theme with CSS variables on `ask-static`: `--askstatic-accent`, `-bg`, `-fg`, `-muted`, `-line`, `-soft`, `-radius`, `-font`, `-on-accent`.

## Limits (by design)

There is no model. It matches your questions and keywords; it does not understand arbitrary sentences, resolve vague references ("that thing from before") or compose new answers. Negations ("not", "без") and unmatched numbers/versions never produce a confident answer; the widget asks for confirmation instead. Knowledge files are public: don't put private content in them.

## Develop

`pnpm install && pnpm build && pnpm test && pnpm eval`, and `cd demo && pnpm dev`.

MIT
