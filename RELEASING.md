# Releasing AskStatic

Two packages are published, **core first**:

| Package | Why |
|---|---|
| `@askstatic/core` | engine; the integration and the widget depend on it |
| `astro-integration-askstatic` | the Astro integration and `<AskStatic />` component |

`pnpm publish` replaces `workspace:*` with the real version in the published `package.json` (verified with `pnpm pack`).

## Before the first publish (once)

1. Log in: `npm login` (and enable 2FA on the account).
2. The `@askstatic` scope must exist. Create the free org at <https://www.npmjs.com/org/create> (name `askstatic`).
   - Do not want an org? Rename the core package to an unscoped name such as `askstatic-core` and update the imports (`rg "@askstatic/core"`).
3. Both names were free on 2026-10-10 (`npm view astro-integration-askstatic` and `npm view @askstatic/core` returned 404). Re-check right before publishing.
4. Add `repository`, `homepage` and `bugs` to both `package.json` files once the GitHub repo exists. That is what the npm page and the Astro integrations directory link to.

## Release checklist

```sh
cd /Volumes/ROG/git/AskStatic

# 1. version (both packages, no git tag yet)
pnpm -r exec npm version 0.1.0 --no-git-tag-version
pnpm install                       # refresh the lockfile

# 2. everything green
pnpm typecheck && pnpm test && pnpm build && pnpm size && pnpm eval
PW_CHANNEL=chrome pnpm e2e         # locally; CI uses Chromium

# 3. look at what would be published
pnpm --filter @askstatic/core publish --dry-run --no-git-checks
pnpm --filter astro-integration-askstatic publish --dry-run --no-git-checks

# 4. publish, core first (add --otp=<code> if 2FA asks for it)
pnpm --filter @askstatic/core publish --access public
pnpm --filter astro-integration-askstatic publish --access public

# 5. tag
git tag v0.1.0 && git push --tags
```

## Installing it into a site

```sh
cd /Volumes/ROG/git/gkanev.com
rm node_modules/astro-integration-askstatic        # the temporary symlink
pnpm add -D astro-integration-askstatic            # run it inside the site: the site pins pnpm 11.1.3
```

The site uses pnpm's `minimumReleaseAge`, so a package published minutes ago is refused. Add it to the exclusion list in the site's `pnpm-workspace.yaml` first:

```yaml
minimumReleaseAgeExclude:
  - astro-integration-askstatic@0.1.0
  - "@askstatic/core@0.1.0"
```

`pagefind` is an optional peer; the site already has it.

## Test an install without publishing

```sh
pnpm build
mkdir -p /tmp/pack && (cd packages/core && pnpm pack --pack-destination /tmp/pack) && (cd packages/astro && pnpm pack --pack-destination /tmp/pack)
mkdir /tmp/fresh && cd /tmp/fresh && npm init -y && npm pkg set type=module
npm i astro@7 pagefind /tmp/pack/askstatic-core-*.tgz /tmp/pack/astro-integration-askstatic-*.tgz
```

Then add the integration to `astro.config.mjs`, put a knowledge file in `src/askstatic/` and run `npx astro build`. This was done on 2026-10-10 and produced `dist/_askstatic/*` and the widget script.
