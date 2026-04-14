# ioBroker.acme Copilot Instructions

**Version:** 0.5.7
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions
**Template Metadata:** https://raw.githubusercontent.com/DrozmotiX/ioBroker-Copilot-Instructions/main/config/metadata.json

These instructions guide GitHub Copilot for this repository.

## Project Context

This repository contains the ioBroker adapter `acme`.

- Purpose: Generate and renew certificate collections via ACME challenges.
- Runtime: Node.js >= 20.
- Language: TypeScript source in `src/`, runtime artifact in `build/`.
- Main implementation: `src/main.ts` (compiled to `build/main.js`).
- Admin UI config: `admin/jsonConfig.json`.
- Translations: `admin/i18n/{de,en,es,fr,it,nl,pl,pt,ru,uk,zh-cn}.json`.
- Adapter mode: schedule mode (`0 0 * * *`), run then terminate.

Adapter-specific scenarios and edge cases:

- Preserve challenge model: HTTP-01 and DNS-01 can be enabled independently; at least one challenge must be active.
- Preserve ACME environment behavior: `useStaging` must switch between staging and production directory URLs.
- Preserve collection processing rules: each collection (`id`, `commonName`, `altNames`) is validated and renewed by policy.
- Keep renewal window behavior deterministic (renew before expiry according to current implementation).
- Keep `CertificateManager` integration intact, including create/update/delete collection behavior.
- Preserve stop/restore flow for other adapters on the same HTTP-01 port.
- Keep run-complete behavior deterministic: cleanup challenge handlers and terminate after processing.

## Code Quality and Style

- Follow `@iobroker/eslint-config` and repository lint settings.
- Keep TypeScript-first development; avoid manual edits in generated `build/` artifacts.
- Prefer explicit async error handling and stable user-facing log messages.
- Preserve strict cleanup behavior in unload paths.

## ioBroker Adapter Practices

- Use adapter APIs consistently (`getObjectAsync`, `setForeignObjectAsync`, `extendObjectAsync`, state/object helpers).
- Keep object lifecycle strict for account and certificate metadata.
- Fail fast on invalid configuration (missing/invalid maintainer email, no collections, missing challenge setup).
- Keep adapter behavior safe when partial failures happen (continue other collections where appropriate).

## ACME and Security Rules

- Never log secrets from DNS provider credentials.
- Preserve redaction of sensitive config/log output.
- Keep `encryptedNative` / `protectedNative` behavior aligned with `io-package.json`.
- Keep DNS module loading constrained to configured provider modules.
- Keep provider-specific behavior intact (for example Netcup propagation handling).
- Do not weaken certificate validation or account handling logic.

## Admin JSON Config and i18n

- Keep `admin/jsonConfig.json` and all `admin/i18n/*.json` files in sync.
- Any new or changed `label`/`help` text requires translation updates in all languages.
- Preserve validator logic and dynamic visibility rules for challenge/provider fields.
- Preserve collection table validation semantics (`id` format and non-empty domain fields).

## Testing Expectations

- Use the official `@iobroker/testing` harness for adapter behavior tests.
- Keep existing test scripts aligned with repository defaults:
  - `npm run test:package`
  - `npm run test:integration`
  - `npm run test:gui`
  - `npm run test`
- Add regression tests for ACME/account/challenge edge cases when fixing bugs.
- Keep tests deterministic and avoid dependence on unstable external systems where possible.

## CI and Release Alignment

- Keep lint-first workflow behavior intact.
- Keep compatibility with the Node.js versions currently used by repository workflows.
- Avoid changing release automation behavior unless explicitly requested.
- Keep user-facing change notes in README/changelog sections according to repository process.

## Dependency and API Guidance

- Keep dependencies minimal and justified.
- Prefer existing project patterns over introducing alternative frameworks.
- Be careful with ACME and DNS provider dependency updates; keep behavior compatibility.

## Repository-Specific Constraints

- Preserve TypeScript source-of-truth workflow (`src/` -> build output).
- Preserve challenge option conventions (`dns01O*` for options, `dns01P*` for post-create properties).
- Preserve current account and certificate persistence behavior and object schema.
- Preserve adapter compatibility expectations from `io-package.json` (`js-controller`, `admin`, and mode settings).
