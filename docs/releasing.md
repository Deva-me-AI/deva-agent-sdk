# Releasing

PR CI installs the locked dependencies, typechecks, runs tests, builds, and installs an npm tarball into a temporary consumer project to check ESM and CommonJS imports.

The `publish.yml` workflow publishes only on a stable `vX.Y.Z` tag matching `package.json`. It validates the package before `npm publish --provenance --access public`. Manual dispatch only packs and validates; it never publishes.

Before pushing a release tag, configure the package's npm trusted publisher with organization `Deva-me-AI`, repository `deva-agent-sdk`, and workflow `publish.yml` (no environment). The workflow uses Node 24, npm 11.6.2, and `id-token: write`. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

The June 17 failed run 27679728946 failed at `Publish (dry-run)` after installation and tests passed. Its logs have expired (GitHub HTTP 410), so the underlying npm error cannot be recovered. The immediately following successful run 27679830635 replaced `npm publish --dry-run` with `npm pack --dry-run`. This workflow retains that packaging-only validation and removes manual publish capability. Actual authentication can only be verified during an authorized release.
