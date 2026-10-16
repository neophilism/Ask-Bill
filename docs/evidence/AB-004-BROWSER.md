# AB-004 rendered preview visual checkpoint (local browser)

Captured from the exact AB-004 reader markup, CSS and client JavaScript by a local Chromium 144 browser under Node 22.16.0.

- Desktop viewport: 1280×850; document horizontal scroll width = 1280, viewport width = 1280. Screenshot PNG resolution: 1280×1398; SHA-256 `e77f1c6dfdf653f5b3e7538296425bf7cdb373e67dbb7f5263bc82da30a9da6e`.
- Narrow mobile viewport: 320×760; document horizontal scroll width = 320, viewport width = 320. Screenshot PNG resolution: 320×3060; SHA-256 `746bf431402bc7fe670e4a20de164c7abac9f41a09b40e4cccbd76fc802b2be3`.
- Observed browser actions: sample question activation and locally sourced answer, visible source citation link, large-text control, hide/show character placeholder. Neither viewport generated a client JavaScript exception.
- A reduced-motion browser context reported `prefers-reduced-motion: reduce`.
- **Not verified:** axe-core audit, keyboard traversal through an actual deployed site, physical mobile devices, screen-reader parity, no-JS route. Browser HTTP navigation was blocked by sandbox browser policy. Instead, the identical HTML output returned by the localhost Node server was fed to Chromium via `set_content` with the repository CSS and JS injected separately. This does not count as a live HTTP end-to-end check. The JavaScript-disabled context timed out and is explicitly unaccepted.
- Visual evidence PNGs exist in the associated model work session and are not in the GitHub branch; filenames `reader-1280px.png` and `reader-320px.png`.

This checkpoint is supplemental evidence only. AB-004 remains partial until the actual Next.js/React interface, full accessible behavior and head-bound CI are accepted.
