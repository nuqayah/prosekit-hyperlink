# Changelog

## Unreleased

- Rejected malformed HTTP authorities and browser-reinterpreted host forms before URL parsing.
- Made Floating UI an optional peer so headless consumers do not install the Svelte positioning layer.
- Added an opt-in legacy-href storage mode that keeps old PM JSON loadable while normalizing accepted destinations and rendering unsafe ones inert.
- Added a host paste-slice transform hook that composes sanitization with linkification.
- Added a standalone, safe ProseKit hyperlink mark and command family.
- Added local autolinking, session-local automatic-link reconciliation, paste handling, and collaboration guarantees.
- Added an optional `prosemirror-markdown` parser/serializer adapter.
- Added configurable per-editor URL policies and an opt-in application-protocol catalogue.
- Added a polished Svelte 5 button/popover interface and the headless `useHyperlink()` hook.
- Added a runnable Vite/Svelte demo and package-quality build, type, and export checks.
- Tightened range detection, schema admission, option resolution, automatic-link bookkeeping, and collaboration no-op behavior.
- Narrowed the public API to one schema-owning extension, removed redundant policy/type shortcuts, and hardened blank-target rendering.
