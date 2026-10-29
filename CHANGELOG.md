# Changelog

## 0.3.0

Changes since the 0.2.0 version commit (`e897486`):

- Register agents through `/v1/agents/register` and parse the nested API key response.
- Refuse to replace an existing agent key unless `force` is explicitly supplied; document safe recovery with a persistent, secret client ID.
- Harden x402 automatic payments with explicit opt-in and challenge validation.
- Publish under `@deva-me/agent-sdk` and fix CommonJS package loading.
- Validate stable release tags against the package version and publish with npm provenance through trusted publishing.
- Add PR typechecks, tests, builds, and installed-tarball ESM/CommonJS smoke tests. Manual release checks only pack the package.
