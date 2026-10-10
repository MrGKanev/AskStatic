import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Issue, validateKnowledge } from '@askstatic/core';
import type { AstroIntegration } from 'astro';
import { loadKnowledge } from './knowledge.ts';
import { findBrokenSources } from './links.ts';
import { type AskStaticOptions, optionsSchema } from './options.ts';
import { buildPack, withBase } from './pack.ts';
import { runPagefind } from './pagefind.ts';

export type { AskStaticOptions } from './options.ts';

const VIRTUAL_ID = 'virtual:askstatic/config';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export default function askstatic(userOptions: AskStaticOptions = {}): AstroIntegration {
  const parsed = optionsSchema.safeParse(userOptions);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(options)'}: ${i.message}`).join('\n');
    throw new Error(`[askstatic] Invalid options:\n${msg}`);
  }
  const options = parsed.data;

  let root = process.cwd();
  let base = '/';
  let knowledgeDir = '';

  return {
    name: 'askstatic',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        root = fileURLToPath(config.root);
        base = config.base || '/';
        knowledgeDir = resolve(root, options.knowledge);
        const packUrl = withBase(base, `${options.outputDir}/`);
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'askstatic-config',
                resolveId: (id: string) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
                load: (id: string) =>
                  id === RESOLVED_ID ? `export default ${JSON.stringify({ packUrl, base: withBase(base, '') })};` : undefined,
              },
            ],
          },
        });
      },

      'astro:server:setup': ({ server, logger }) => {
        let cache: Promise<Map<string, string>> | undefined;
        const build = async () => {
          const loaded = await loadKnowledge(knowledgeDir, root);
          for (const e of loaded.errors) logger.error(e);
          const result = validateKnowledge(loaded.items);
          report(result.issues, loaded.files, loaded.items, (m) => logger.warn(m), (m) => logger.error(m));
          // Pagefind only exists after a production build, so the dev pack never advertises it.
          return buildPack(result.entries, options, base, false).files;
        };
        server.watcher.add(knowledgeDir);
        server.watcher.on('all', (_event, file) => {
          if (file.startsWith(knowledgeDir)) cache = undefined;
        });

        const prefix = withBase(base, `${options.outputDir}/`);
        server.middlewares.use(async (req, res, next) => {
          const url = (req.url ?? '').split('?')[0] as string;
          if (!url.startsWith(prefix)) return next();
          cache ??= build();
          const files = await cache;
          const name = url.slice(prefix.length);
          const body = files.get(name);
          if (body === undefined) return next();
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          res.end(body);
        });
      },

      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const loaded = await loadKnowledge(knowledgeDir, root);
        const problems: string[] = [...loaded.errors];
        const result = validateKnowledge(loaded.items);
        const warnings: string[] = [];
        report(result.issues, loaded.files, loaded.items, (m) => warnings.push(m), (m) => problems.push(m));
        warnings.push(...findBrokenSources(result.entries, outDir, base));

        if (result.entries.length === 0 && problems.length === 0) {
          problems.push(`no knowledge entries found in ${options.knowledge}`);
        }
        for (const m of warnings) logger.warn(m);
        if (problems.length || (options.strict && warnings.length)) {
          for (const m of problems) logger.error(m);
          throw new Error(`[askstatic] ${problems.length} error(s), ${warnings.length} warning(s) in knowledge. Fix them or relax \`strict\`.`);
        }

        const pagefind = await runPagefind(outDir, options.pagefind, logger);
        const pack = buildPack(result.entries, options, base, pagefind);
        const target = join(outDir, options.outputDir);
        await mkdir(target, { recursive: true });
        for (const [name, body] of pack.files) {
          await mkdir(dirname(join(target, name)), { recursive: true });
          await writeFile(join(target, name), body);
        }
        logger.info(`Built ${result.entries.length} entries for ${pack.languages.join(', ')} (${[...pack.files.values()].reduce((n, f) => n + f.length, 0)} bytes uncompressed).`);
      },
    },
  };
}

function report(
  issues: Issue[],
  files: string[],
  items: unknown[],
  warn: (m: string) => void,
  error: (m: string) => void,
) {
  const fileOf = (id?: string) => {
    const i = items.findIndex((x) => (x as { id?: unknown } | null)?.id === id);
    return i >= 0 ? `${files[i]}: ` : '';
  };
  for (const i of issues) {
    const msg = `${fileOf(i.entryId)}${i.entryId ? `[${i.entryId}] ` : ''}${i.message}`;
    (i.severity === 'error' ? error : warn)(msg);
  }
}
