# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ioBroker.acme is an ioBroker adapter that generates SSL/TLS certificate bundles using the ACME protocol (Let's Encrypt). It supports HTTP-01 and DNS-01 challenge verification with 11 DNS providers. The adapter runs on a schedule (daily by default) and renews certificates 7 days before expiry.

## Commands

### Build
```bash
npm run build          # Full build: clean + npm install src-admin + Vite build + copy + TypeScript compile
npm run build:tsc      # TypeScript compile only (src/ -> build/)
npm run npm            # Install deps in root and src-admin
```

Build steps can be run individually:
- `npm run 0-clean` - Clean admin/custom and src-admin/build
- `npm run 1-npm` - npm install in src-admin/
- `npm run 2-build` - Vite build of admin UI
- `npm run 3-copy` - Copy built admin files to admin/custom/

### Test
```bash
npm test                    # All tests (unit + package + integration + gui)
npm run test:js             # Mocha unit tests
npm run test:package        # Package validation
npm run test:integration    # Integration tests + GUI tests
npm run test:gui            # GUI tests only
```

Test framework: Mocha + Chai (should style) + Sinon. Integration tests use `@iobroker/testing`.

### Lint
```bash
npm run lint           # ESLint with flat config (@iobroker/eslint-config)
```

ESLint only covers `src/` — ignores src-admin, admin, test, build, node_modules, tasks.js.

### Other
```bash
npm run translate      # Auto-generate translations for admin UI
npm run dev-server     # Dev server for admin UI development
npm run release        # Interactive release via @alcalzone/release-script
```

## Architecture

### Two codebases in one repo

1. **Adapter backend** (`src/`) — TypeScript compiled to `build/main.js`
   - `src/main.ts` — `AcmeAdapter` class extending `utils.Adapter`. Handles the full certificate lifecycle: ACME client init, account management, challenge coordination, cert generation/renewal, and port conflict resolution with other adapters.
   - `src/lib/http-01-challenge-server.ts` — HTTP server for ACME HTTP-01 challenges.
   - `src/types.d.ts` — `AcmeAdapterConfig` interface with all native config fields.

2. **Admin UI** (`src-admin/`) — React + Vite with Module Federation, built to `admin/custom/`
   - `src-admin/src/AcmeComponent.tsx` — Custom React component for certificate status display.
   - `src-admin/src/Components.tsx` — Federation entry point exposing `ConfigCustomAcmeSet`.
   - Uses `@module-federation/vite` to expose components dynamically.
   - Has its own `package.json` with separate dependencies.

### Configuration
- `admin/jsonConfig.json` — Declarative admin UI (tabs: Main, Challenges, Collections, Status). This is the primary config UI definition.
- `io-package.json` — ioBroker adapter metadata. Mode is `schedule`. Encrypted native fields: `dns01Okey`, `dns01Osecret`, `dns01Otoken`, `dns01OapiKey`, `dns01OapiUser`.

### Key adapter behaviors
- Runs as a scheduled adapter (not daemon) — executes, processes certificates, then exits.
- Before starting HTTP-01 challenge server, stops other adapters using the same port, then restores them after.
- DNS-01 providers are loaded dynamically: `require(\`acme-dns-01-${module}\`)`.
- Certificate data is stored via ioBroker's `CertificateManager` from `@iobroker/webserver`.

## Conventions

- Indentation: 4 spaces
- Use `this.log.*` (error/warn/info/debug) for logging, never `console.log`
- Use native `fetch` for HTTP (Node.js 20+ required)
- Translations: minimum English and German, 11 languages total in `admin/i18n/` and `src-admin/src/i18n/`
- Releases follow @alcalzone/release-script with changelog under `## **WORK IN PROGRESS**`
