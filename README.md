# Aer Apps

Downloadable, versioned local applications for Aer. The first app is Excalidraw.

The browser installs a signed catalog and a SHA-256-verified `.aerapp` ZIP. Packages contain static resources, a manifest and license notices. They do not execute native installation scripts. Aer serves the installed app on a Profile-specific loopback origin and saves documents atomically inside that Profile. The app bundle has no model credentials.

## Build a release

Use Node 22+, Python 3 and npm. Install locked dependencies with `npm ci --ignore-scripts` in `apps/excalidraw`. The build-time dependencies are not included in the app archive.

Run `AER_APPS_SIGNING_KEY=/secure/path/key.pem node tooling/package.mjs`. The ECDSA P-256 private key must remain outside this repository. Store it securely; a different key requires a trusted browser update. Set `AER_APPS_SEQUENCE` to a monotonically increasing integer when preparing catalog releases.

The output is `dist/excalidraw-VERSION.aerapp`. Publish this asset as GitHub release `excalidraw-vVERSION` before committing the new `catalog/stable.json`. The catalog expires after 90 days and must be reissued before expiry. Preserve `catalog/trust.json` as the public trust record and ship it in Aer as `aer-apps-trust.json`.

Bump the wrapper version in `apps/excalidraw/package.json` for every changed build. Never replace a previously published version's asset. Existing documents remain on uninstall. Updates activate a new immutable version directory and retain the previous package.

## In Aer

Settings → AI & Extensions → Aer Apps. Paid Aer BYOK and Pro leases enable installation and editing. Expired memberships can still open and export saved documents.

`⌥⌘A` opens the application launcher; `⌥⌘E` opens Excalidraw. In the right AI sidebar, use `/draw 描述要画的内容` to preview and add shapes. Applying checks that the document has not changed; it never accepts JavaScript from the model.
