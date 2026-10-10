import type { AstroIntegrationLogger } from 'astro';
import type { ResolvedOptions } from './options.ts';

/** Indexes the finished build with Pagefind. Returns false (with a warning) if Pagefind is unavailable or fails. */
export async function runPagefind(outDir: string, pagefind: ResolvedOptions['pagefind'], logger: AstroIntegrationLogger): Promise<boolean> {
  if (pagefind === false) return false;
  let mod: typeof import('pagefind');
  try {
    mod = await import('pagefind');
  } catch {
    logger.warn('"pagefind" is not installed, so the full-site search fallback is disabled. Run `npm i -D pagefind` or set `pagefind: false`.');
    return false;
  }
  const config = typeof pagefind === 'object' ? pagefind : {};
  const { index, errors } = await mod.createIndex({
    rootSelector: config.rootSelector,
    excludeSelectors: config.excludeSelectors,
  });
  if (!index) {
    logger.warn(`Pagefind could not create an index: ${errors.join('; ')}`);
    return false;
  }
  try {
    const added = await index.addDirectory({ path: outDir });
    if (added.errors.length) logger.warn(`Pagefind: ${added.errors.join('; ')}`);
    const written = await index.writeFiles({ outputPath: `${outDir}/pagefind`.replace(/\/+/g, '/') });
    if (written.errors.length) {
      logger.warn(`Pagefind: ${written.errors.join('; ')}`);
      return false;
    }
    logger.info(`Pagefind indexed ${added.page_count} pages.`);
    return true;
  } finally {
    await mod.close();
  }
}
