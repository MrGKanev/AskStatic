# Releasing AskStatic

One package is published: **`astro-integration-askstatic`** (the integration, the `<AskStatic />` component and the engine in `src/core`). The monorepo only exists for development (`packages/astro`, `demo/`, `e2e/`).

## Release checklist

```sh
cd /Volumes/ROG/git/AskStatic

# 1. version
cd packages/astro && npm version 0.1.0 --no-git-tag-version && cd ../..   # only needed if 0.1.0 is already taken

# 2. everything green
pnpm typecheck && pnpm test && pnpm build && pnpm size && pnpm eval
PW_CHANNEL=chrome pnpm e2e         # locally; CI uses Chromium

# 3. look at what would be published
cd packages/astro && pnpm pack --pack-destination /tmp/pack && tar tzf /tmp/pack/astro-integration-askstatic-*.tgz

# 4. publish (npm asks for a 2FA code; add --otp=<code> if it does not prompt)
pnpm --filter astro-integration-askstatic publish --access public --no-git-checks

# 5. tag
git tag v0.1.0 && git push --tags
```

Run `pnpm publish` through the filter above, not `npm publish` in the repo root: the root package is a private monorepo container and has no version.

## Installing it into a site

```sh
cd /Volumes/ROG/git/gkanev.com
rm node_modules/astro-integration-askstatic        # the temporary symlink
pnpm add -D astro-integration-askstatic            # run inside the site: it pins pnpm 11.1.3
```

The site uses pnpm's `minimumReleaseAge`, so a package published minutes ago is refused. Add it to the exclusion list in the site's `pnpm-workspace.yaml` first:

```yaml
minimumReleaseAgeExclude:
  - astro-integration-askstatic@0.1.0
```

`pagefind` is an optional peer; the site already has it.

## Test an install without publishing

```sh
pnpm build
mkdir -p /tmp/pack && (cd packages/astro && pnpm pack --pack-destination /tmp/pack)
mkdir /tmp/fresh && cd /tmp/fresh && npm init -y && npm pkg set type=module
npm i astro@7 pagefind /tmp/pack/astro-integration-askstatic-*.tgz
```

Then add the integration to `astro.config.mjs`, put a knowledge file in `src/askstatic/` and run `npx astro build`.
