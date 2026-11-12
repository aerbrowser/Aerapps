# Aer Apps: local applications

These downloadable `.aerapp` packages require **Aer Apps host API 2 on macOS Apple Silicon**. The host changes have been built and tested in an isolated Aer candidate. Publishing these packages does not update the installed Aer browser; API 1 clients continue using the unchanged Excalidraw catalog.

| App wrapper | Upstream | Package contents | Local data |
| --- | --- | --- | --- |
| Super Productivity 0.1.0 | 20.0.0 | Official web build | Profile IndexedDB |
| Memos 0.1.0 | 26.11.0 | Official macOS arm64 Go server, embedded UI | SQLite and attachments |
| AFFiNE 0.1.0 | 0.27.4 | Official frontend, local fonts, local workspace mode | Profile IndexedDB |
| DeepSeek Harness 0.1.1 | 0.2.2-rc.1 | Official dsh web and locked dependencies; Node 24.22.2, standalone Python 3.11.16, npm, pnpm 11.28.5, native LibreOffice 0.1.5 | Profile app data directory |

Users do not install Node, Python, Go, Docker, PostgreSQL, Redis, npm or build tools. Process applications start automatically when their tab opens and stop when Aer exits normally. All four open as normal Aer tabs. `⌥⌘A` opens the app launcher. Installation remains a paid Aer capability.

AFFiNE uses **Start AFFiNE without an account** on its initial screen. Its self-hosted cloud server, account/sync service and hosted AI are not bundled. Memos creates a local administrator on first use. Harness starts without a model credential, but model calls require a configured provider/account; the package does not contain model weights, API keys, or every dependency of arbitrary user projects. Node includes npm and npx; Harness plugin management uses bundled pnpm 11.28.5. Python includes its standard library and pip; workspace-specific third-party libraries are separate from the app's own complete dependencies. Upstream UI can offer optional cloud integrations that are outside this local package.

## Package and trust model

The archive is a ZIP of regular files with a manifest, upstream metadata and license notices. API 2 declares `runtime.type` as `static` or `process`, the bundled executable/arguments, an explicit environment and executable-file allowlist. The native installer verifies the signed catalog, expected byte size and SHA-256, rejects traversal/links/duplicate paths and malformed manifests, and activates an immutable version directory. It never executes an installation script or package manager.

Each app/Profile receives a stable loopback origin and its own data directory. Aer authenticates browser requests with an HttpOnly session cookie, checks Host and Origin, and forwards HTTP bodies, streaming responses and WebSockets for process applications. Child processes receive an isolated HOME and a minimal PATH; host credentials are not inherited. Web app IndexedDB remains inside the Aer browser Profile; service data is under `AerApps/data/<id>`. Back up the whole Profile when moving local apps. Uninstall retains data.

`catalog/stable.json` remains API 1. `catalog/v2/stable.json` contains all five apps. Upload immutable release assets **before** publishing the new signed catalog. The catalog expires after 90 days. Keep the signing private key outside this repository; `catalog/trust.json` is public.

## Rebuild on a development machine

The following build tools are needed by maintainers only: Node, npm, Python, and `fonttools==4.68.0` / `brotli==1.2.1` for AFFiNE font conversion. Pin inputs using each app's `upstream.json` and the Harness npm lockfile.

- `tooling/oci-assets.py` verifies a selected official OCI layer by SHA-256, then extracts assets without running Docker. It materializes in-prefix hard links as regular files. For AFFiNE use layer 6, prefix `app/static/`, and `--omit-mobile`; for Super Productivity use layer 8 and `usr/share/nginx/html/`.
- AFFiNE: run `tooling/prepare-affine.py <stage/ui> <NotoSansSC.ttf>` on those assets. The Google Fonts source blob is pinned; bundled Inter WOFF2 fonts are converted to WOFF for document export, and a static Noto Sans SC replaces the unavailable remote PDF font. Keep its OFL notice.
- Memos: verify the official `memos_26.11.0_darwin_arm64.tar.gz` digest, extract `memos` into `stage/bin/memos`, and copy its app manifest, upstream metadata and license.
- Harness: run `npm ci --omit=dev --ignore-scripts` in `apps/deepseek-harness`. The macOS LibreOffice package is an explicit dependency so npm cannot silently omit the required engine. Run `tooling/stage-harness.py <node-directory> <python-install-only.tar.gz> <empty-stage>`. Interpreter aliases and internal dependency links become ordinary files. Preserve the complete dependency lockfile and upstream notices.
- Build each release with `AER_APPS_SIGNING_KEY=/secure/key.pem node tooling/package-v2.mjs <id> <stage>`. Source maps, TypeScript declarations, caches and `.bin` symlinks are omitted. Declared executables receive their execution modes only after verification. Do not change published bytes without bumping the wrapper version.

## Verification scope

All four final release archives were downloaded again from their public GitHub URLs, matched against the signed catalog by size and SHA-256, and installed into a fresh isolated Profile using the production native Store API. The public v2 catalog passed native verification for all five entries; the legacy v1 catalog is unchanged. Real Aer tab verification used the same package bytes. After an Aer restart and with external HTTPS requests blocked in the app tabs: the Super Productivity task, Memos note, AFFiNE document and Harness language setting persisted. Unauthenticated local requests returned 403. The five-app settings catalog rendered. Normal Aer exit reaped its Memos/Harness processes. This does not establish cleanup after a browser crash or forced termination.

The installed Harness package passed clean-environment Python/SQLite/SSL checks, a native terminal check, Sharp loading, and real DOCX-to-PDF conversion using bundled LibreOffice. Version 0.1.1 additionally passed Node/npm/npx/pnpm/Python/pip checks and an offline pnpm dependency installation; upgrading from 0.1.0 retained its language preference. No system Node or Python was needed. Native regression tests covered API 1 compatibility, signatures/hash/path protection, API 2 malformed manifests, app isolation, executable modes, minimal child environment, readiness, shutdown and startup cancellation. A machine-readable publication summary is in `verification/2026-11-12.json`.

The paid-account one-click download flow and real paid model inference were not exercised in the signed-out test Profile. This is a macOS arm64 release; Windows, Linux and Intel builds are not included. Excalidraw's `/draw` adapter remains specific to Excalidraw; these upstream apps have not acquired that adapter or its membership-expiry read-only editing policy.
