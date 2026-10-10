# AGENTS.md

Instructions for AI coding agents working in this repo. Tool-specific files (`CLAUDE.md`, Cursor, Codex) point here.

Crafton is a free, open-source Shopify Online Store 2.0 theme for lightweight stores: Liquid, CSS and vanilla JS only. There is no build step and no test suite. It shares its foundation with the Elewind pro theme (color schemes, Design System, type roles, typography blocks, basic motion) and keeps everything else small.

```
shopify theme dev      # preview
shopify theme check    # lint
```

## Architecture

- **JSON templates + sections.** `templates/*.json` list sections; merchants add, remove and reorder them in the theme editor. `gift_card.liquid` is the one Liquid template.
- **Layouts.** `layout/theme.liquid` renders the header group, `content_for_layout` and the footer group. `layout/password.liquid` renders only the password template. Both load `snippets/theme-styles.liquid` (scheme roles, type roles, Design System) before `content_for_header`.
- **Page sections** are `sections/main-*.liquid`, wrapped in the shared page shell (`.page-shell` in `assets/base.css`).
- **Featured families** (from Elewind, unchanged): Featured collection (`blocks/_cfx_collection.liquid`, `assets/collection-featured.js`), Featured articles (`_afx_feature`, `article_card` + `_article_*` blocks, `assets/articles-featured.js`), Featured blogs (`_bfx_feature`, `blog_cover_card` + `_blog_*` blocks, `assets/blogs-featured.js`). Each section is a shell: Rich content intro + the feature block. Carousels are Swiper, loaded lazily through `Motion.whenSwiper` (`assets/motion-reveal.js`); View more paging goes through `assets/loader-fetch.js` + `assets/loader-state.js` + `snippets/ldx-state.liquid`.
- **Collection list** (from Elewind, unchanged): `sections/list-collections.liquid` + `blocks/list_collections.liquid` + `blocks/_collection_card.liquid`, carousel through `<container-carousel>` (`assets/container-carousel.js`, Swiper via `Motion.whenSwiper`).
- **Classic sections** (`cls-` family): Featured products, Classic collection tabs and Classic collection list. Each carries the standard Animations group and the Section Design Mode panel. Shared parts: `snippets/classic-head.liquid`, `snippets/classic-panel.liquid` (grid / native scroll-snap carousel, family layout CSS), `assets/classic-tabs.js` (`<classic-tabs>`, tabs and arrows only).
- **Cards**: `snippets/collection-product-card.liquid` (`opc-`), `snippets/collection-list-card.liquid` (`clc-`), `blocks/article_card.liquid` (`arc-`), `blocks/blog_cover_card.liquid` (`bcc-`), `snippets/classic-article-card.liquid` (blog page). Their hover lift lives in one layer at the end of `assets/base.css`.
- **Typography blocks** (`heading`, `subtitle`, `text`, `rich_text`, `rich_content`, `button`, `label`, `caption`, `_accent_line`) and `email_signup` are theme blocks. The Newsletter section is a shell that renders them with `{% content_for 'blocks' %}`.

## Rules

- Touch only the files the task needs. Read the current file before you change it; the user edits code by hand. Never revert work the user changed.
- Don't rename files, classes, ids, settings or variables, and don't remove features, unless asked. Don't add libraries without approval.
- CSS is split in two, both in the file itself:
  - Static rules go in the file's `{% stylesheet %}` tag, written against the shared class. No Liquid inside it, not even comments.
  - Per-instance values (settings, `block.id`, `section.id`) go in a scoped `{% style %}` tag that only sets custom properties on `.thing--{{ block.id }}` / `{{ section.id }}`.
  - Write both mobile-first, with exactly one `@media (min-width: 768px)` override. No horizontal overflow. No needless `!important`.
- Colours only through `color_scheme` settings and `var(--color-*)` roles. No raw colour pickers.
- Spacing, radius, gaps, gutters and widths only through the resolved `--ds-*` tokens (`snippets/design-system-vars.liquid`). A section with cards or a carousel takes the Section Design Mode override (Auto / Blend / Custom): render `snippets/section-design-mode.liquid` in its root's scoped style and copy only the contract settings its markup consumes, with their ids, options and defaults unchanged.
- The product card (`collection-product-card`, `opc-`) and collection card (`collection-list-card`, `clc-`) are Elewind's, unchanged. Style them through their documented data attributes and custom properties, never by editing the snippets.
- Typography through the shared `--font-*`, `--fs-*`, `--lh-*`, `--ls-*` tokens and `snippets/typography-resolver.liquid`.
- Entrance animations go through `snippets/motion-reveal.liquid` (CSS classes + timing variables, animated by `assets/motion.css`, switched on by `assets/motion-reveal.js`). Keep motion basic: fade, fade up/down, slide, scale, mask reveal, staggered groups. No scroll scrub, parallax or split text. GSAP loads only for accent typography, lazily, from `snippets/accent-typography.liquid`.
- JS: vanilla, guard against double initialization, survive theme-editor reloads (`shopify:section:load`, `shopify:block:select`).
- Every file starts with a 2–5 line comment saying what it is and how it works. Snippets document every render parameter.
- Every user-facing storefront string uses a `'key' | t` lookup in `locales/en.default.json`. Global theme-setting labels live in `locales/en.default.schema.json`.
- Use `routes.*` for storefront URLs.

## Schema settings

- Don't add or change settings, blocks or presets unless asked. When asked, add exactly what was requested, make each one work, and keep the schema valid.
- Write labels for merchants: describe the result they will see. No CSS, code or setting ids in labels.
- Hide settings that do nothing in the current state with `visible_if` (block's own settings or `section.settings` only; no parentheses; 250 characters max).
- Color scheme defaults are `scheme_1` … `scheme_6`, the ids in `config/settings_data.json`.

## Liquid trap

Never write `{% %}` or `{{ }}` inside a `{%- liquid -%}` tag, not even in `#` comments. The tag closes at the first `%}`, and everything after it prints as raw text.

## Naming

Follow `CODE-NAMING-CONVENTIONS.md`. If it doesn't cover the case, ask the user, offering 3–4 concrete options. After you write or replace code, append a dated entry to its Convention log.

## Tracking

Log changes in `changelog.md`.

## Testing

Check the code you changed. For bigger features also run `shopify theme check` and test interactions and breakpoints. Never claim a test ran when it didn't.
