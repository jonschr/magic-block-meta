# Changelog

## 0.2.1 - 2026-04-08
- Added an explicit `Link Target` control for `core/button` in the block editor so button targets can be set clearly in post, template, and loop editing contexts.
- Split `Magic Post Terms` editing modes so single-post editing stays content-only for term assignment, while templates and loops retain taxonomy/display settings and paragraph-style controls.

## 0.2.0 - 2026-04-08
- Made `Magic Post Terms` scalable by adding a search field inside the term picker and switching the editor to fetch matching terms on demand instead of loading a fixed first batch.

## 0.1.9 - 2026-04-08
- Fixed the `Magic Post Terms` dropdown toggle so clicking the inline control in the single-post editor opens the term picker correctly.

## 0.1.8 - 2026-04-08
- Simplified the in-canvas editor UI for the placeholder and terms blocks by removing descriptive helper text that is already available in the block sidebar.

## 0.1.7 - 2026-04-08
- Removed the selected-state requirement from `Magic Post Terms` so its taxonomy picker and inline term editor stay available directly in the single-post editor.

## 0.1.6 - 2026-04-08
- Updated `Magic Post Terms` to use a white click-to-open multi-select dropdown that shows all terms immediately, removed the duplicate taxonomy label above the input, prefixed taxonomy variation names with `Magic Meta Blocks:`, and aligned the block supports more closely with paragraph-style controls.

## 0.1.5 - 2026-04-08
- Added a new `Magic Post Terms` block that mirrors the core post terms block, supports optional plain-text output, and can edit the current post's assigned terms directly inside the block while editing a post.

## 0.1.4 - 2026-04-08
- Fixed the placeholder block so it can edit registered meta directly in the single-post editor, including before the post has been saved.
- Simplified the placeholder UI into a compact label, summary line, and input.

## 0.1.3 - 2026-04-08
- Added a new `Magic Meta Field: Placeholder` block for editing registered text meta from an editor-only placeholder that renders nothing on the front end.

## 0.1.2 - 2026-04-08
- Updated the plugin update checker to use the public `jonschr/magic-block-meta` repository.

## 0.1.1 - 2026-04-01
- Added GitHub-based plugin update checking for the `master` branch of `jonschr/magic-block-meta`.
- Added a local bundled copy of `plugin-update-checker` under `vendor/`.

## 0.1.0 - 2026-04-01
- Initial release.
