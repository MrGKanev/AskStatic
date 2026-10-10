# AskStatic

A chat widget for [Astro](https://astro.build) sites that answers visitors' questions from content **you write**: no server, no database, no API calls, no language model. Answers, clarifying questions and source links are generated at build time; in the browser it is plain search plus a few rules, with site-wide [Pagefind](https://pagefind.app/) search as the fallback.

```js
// astro.config.mjs
import askstatic from 'astro-integration-askstatic';
export default defineConfig({ integrations: [askstatic({ languages: ['en'] })] });
```

```astro
---
import AskStatic from 'astro-integration-askstatic/component';
---
<AskStatic />
```

**Install, knowledge format, options, theming and limits are documented in [`packages/astro/README.md`](packages/astro/README.md)** (the same text is on the npm page).

## Repository layout

| Path | What |
|---|---|
| `packages/astro` | The published package `astro-integration-askstatic`: integration, `<AskStatic />` component, widget and the engine in `src/core` |
| `demo/` | A small Astro site (English and Bulgarian knowledge) used for tests and size measurements |
| `e2e/` | Playwright + axe browser tests |
| `ACTION-PLAN.md` | Roadmap and status |
| `ONBOARDING-PLAN.md` | Plan for install-time interview, authoring tools and feedback loop |
| `RELEASING.md` | How to publish and install |

## Develop

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm build
pnpm size && pnpm eval
pnpm e2e            # PW_CHANNEL=chrome reuses an installed Chrome
```

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, build, the size budget, the eval and the browser tests on every push, plus an informational demo build on Astro 5, 6 and latest.

## Status

Version 0.1, tested with Astro 7 and Node 22+. No automated screen-reader or real-phone testing yet.

MIT © Gabriel Kanev
