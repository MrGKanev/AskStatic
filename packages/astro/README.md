# astro-integration-askstatic

A chat widget for Astro sites that answers visitors' questions **without a server, database, API or language model**. Answers are written by you, matched at build-time-generated search, and shown with links to the source pages.

- **Answers you wrote**, with rich text (paragraphs, lists, **bold**, links) and "you might also ask" follow-ups
- **Asks one clarifying question** when the answer depends on a detail (platform, plan, scope, …)
- **Falls back to site search** ([Pagefind](https://pagefind.app/)) when there is no good match, instead of guessing
- **Looks like a modern assistant**: typing indicator, source cards, starter chips, clear-chat button, light and dark theme that follows your site
- **Accessible**: dialog with managed focus, screen-reader announcements, 44 px targets, keyboard only, `forced-colors` and reduced-motion support, checked with axe (WCAG 2.2 AA)
- **Small**: about 8.5 KB gzipped on every page; the engine and your knowledge (about 12 KB for a small site) load only when the chat is first opened
- English and Bulgarian built in (including Latin-typed Bulgarian); other languages through language packs

> **Status: 0.1.** Developed and tested against Astro 7 and Node 22+. The `astro` peer range (`>=5`) is wider than what has been tested.

## Install

```sh
npm i astro-integration-askstatic
npm i -D pagefind        # optional: enables the site-search fallback
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

Put the component in a layout. It marks itself `data-pagefind-ignore`. With pnpm 10+ you may need to allow build scripts for Astro's own dependencies (`sharp`, `esbuild`); that is unrelated to this package.

## Write knowledge

Add YAML or JSON files under `src/askstatic/`. A file holds one entry or a list; files and folders starting with `_` or `.` are ignored.

```yaml
- id: pricing
  language: en
  title: Pricing
  suggested: true                 # shown as a starter chip
  questions: ["How much does it cost?", "Is there a free plan?"]
  keywords: [price, cost, billing, fee, quote]
  answer: |-
    There is a **free plan**. Paid plans start at $9 per month:

    - **Pro** - for individuals
    - **Team** - adds shared projects

    See the [pricing page](/pricing/) for details.
  sources: [{ title: Pricing, url: /pricing/ }]
  followUps: [refunds]            # offered as "You might also ask"

- id: installation                # a topic with a clarifying question needs no answer of its own
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

**Formatting in `answer`:** blank line = new paragraph; lines starting with `- ` or `1. ` make lists; `**bold**`, `` `code` `` and `[text](/path/)` work. Nothing is ever injected as HTML.

**What the build checks:** ids are unique per language; every `answerId` and `followUps` id exists in the same language; no clarification cycles; sources are site paths (`/docs/x/`) or http(s) URLs; internal source links are checked against the built pages. Errors fail the build. Warnings (missing sources, the same example question on two entries, broken links) are printed and fail the build with `strict: true`.

**Writing tips**

- The example `questions` are the strongest matching signal. Write the phrasings your visitors really use, including the vocabulary around money (price, cost, rate, quote, budget), contact, hiring and availability.
- Give every entry `keywords` for the single words people type.
- One topic per entry. Put the same example question on only one entry, otherwise the chat will ask "did you mean…".
- A question that matches nothing falls back to site search, never to a guess.

## Options

| Option | Default | |
|---|---|---|
| `knowledge` | `'src/askstatic'` | Folder with knowledge files |
| `languages` | all found | Languages to build |
| `defaultLanguage` | `'en'` | Used when the page language has no knowledge |
| `pagefind` | `true` | `false`, or `{ rootSelector, excludeSelectors }`. Skipped with a warning if `pagefind` isn't installed |
| `outputDir` | `'_askstatic'` | Folder inside the build output |
| `thresholds` | | `{ minCoverage, minScore, gap, maxCandidates }`: tune the answer / clarify / fallback decisions |
| `strict` | `false` | Fail the build on warnings |

### Component props

```astro
<AskStatic
  title="Ask about Acme"
  labels={{
    greeting: 'Hi! Ask me about plans, billing or setup.',
    subtitle: 'Quick answers about Acme',
    placeholder: 'Ask about pricing…',
    note: '',            // an empty string hides the small note under the input
  }}
/>
```

`lang` sets the chat language (default: the page's `<html lang>`). `labels` overrides any UI string: `title`, `subtitle`, `greeting`, `placeholder`, `note`, `send`, `sources`, `followUp`, `back`, `otherTopic`, `clear`, `noMatch`, `didYouMean`, `siteResults`, `leadIns` (short lead-in lines separated by `|`, one per answer; empty to disable), and the rest in `client/strings.ts`.

### Theming

Set CSS variables on `ask-static`. They are inherited, so you can point them at your own design tokens and the widget follows your light/dark switch automatically:

```css
ask-static {
  --askstatic-accent: var(--text);
  --askstatic-on-accent: var(--bg);
  --askstatic-bg: var(--surface);
  --askstatic-fg: var(--text);
  --askstatic-muted: var(--text-secondary);
  --askstatic-line: var(--border);
  --askstatic-soft: var(--bg);
  --askstatic-font: var(--font-body);
  --askstatic-radius: 20px;
}
```

Without overrides the widget uses `prefers-color-scheme`, or `data-theme="light|dark"` on the element.

## How it behaves

- The conversation is kept in `sessionStorage` for the tab, and an open chat stays open across page navigations without taking focus. The trash icon in the header clears the conversation and the saved session.
- A question sent before the engine has loaded is queued, not dropped.
- With `prefers-reduced-motion` there is no typing delay and no animation.
- Screen readers hear each new reply through a polite status region; the message log itself is not live, so history is not re-read.

## Limits (by design)

There is no model. It matches your questions and keywords; it does not understand arbitrary sentences, resolve vague references ("that thing from before") or compose new answers. Negations ("not", "без") and unmatched numbers or versions never produce a confident answer; the widget asks for confirmation instead. Knowledge files are public: don't put private content in them. Pagefind results for languages with rich morphology (such as Bulgarian) can be weak. The widget has not been tested with Astro's `ClientRouter` view transitions, only with full page navigations.

## Develop

From the monorepo root:

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm build
pnpm size        # size budget
pnpm eval        # answer-quality eval on the demo knowledge (prints precision and confident-wrong count)
pnpm e2e         # Playwright + axe; PW_CHANNEL=chrome reuses an installed Chrome
cd demo && pnpm dev
```

The engine lives in `src/core` and is shipped inside this package; there is nothing else to install.

MIT © Gabriel Kanev
