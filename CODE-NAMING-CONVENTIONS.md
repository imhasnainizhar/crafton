# Code and naming conventions

Single source of truth for how code is named and organised in Crafton. Shared
foundation files keep the names they have in Elewind.

## Established conventions

- **Component families own a short prefix.** `cls-` is the classic section family, `opc-` the Collection Product Card, `ds-` the resolved Design System tokens, `motion-reveal` the entrance system. A family's prefix appears on its CSS classes, its `data-` hooks and its custom properties alike.
- **CSS**: `.prefix-block`, `.prefix-block__element`, `.prefix-block--modifier`. Per-instance styles are scoped by `.something--{{ block.id }}` / `{{ section.id }}`. Only genuinely shared primitives live in `assets/` (`base.css`, `motion.css`).
- **JS hooks** are `data-` attributes, never classes: `data-cls-tab`, `data-cls-viewport`.
- **Custom properties** are `--prefix-thing`; resolved Design System tokens are `--ds-*`; scheme roles are `--color-*`.
- **Custom elements** are `<kebab-case>` and registered idempotently (`if (customElements.get('x')) return;`).
- **Schema setting ids** are `snake_case` and grouped by their header's concern.
- **Schema ids are for developers; schema labels are for merchants.**
- **Color scheme ids** are `scheme_1` … `scheme_6`.

### Ask before deciding a new convention

Never decide a naming convention on your own. If nothing here covers the case, offer the user 3–4 concrete options, wait for the answer, check the name is free with one grep, then apply it and log it below.

## Convention log

## Crafton on the Elewind foundation — 2026-10-10

Port of the Elewind foundation and classic sections onto JSON templates. Names
marked *(pending review)* were picked during the port without asking first and
still need the user's confirmation.

- Kept from Elewind unchanged: every token resolver snippet, the typography
  blocks, `motion-reveal`, the `cls-` family (sections `featured-products`,
  `classic-collection-tabs`; snippets `classic-head`, `classic-panel`,
  `classic-article-card`; `<classic-tabs>`), `opc-` card classes, the
  `newsletter` section.
- New classic sections: `featured-collection`, `featured-articles`,
  `featured-blogs` (block type `blog`).
- New `cls-` names: snippet `classic-blog-card`; class `.cls-head__link`;
  classic-head params `link`, `link_label`, `motion`; classic-panel param
  `motion` (replaces `swipe`); classic-article-card params `url`, `title`,
  `image`, `meta`, `excerpt`.
- New `opc-` names: `.opc-card__badge`. Removed: plate / float / cart / icon /
  skeleton variants and their data attributes.
- New setting ids: `show_view_all`, `view_all_label`, `products_count`
  (featured collection), `show_count`, `show_latest`, block `image`;
  classic-section animation group `animation_enabled`, `animation_effect`
  (the `motion-reveal` prefix).
- *(pending review)* Snippet `theme-styles` (shared `<head>` styling of both
  layouts).
- *(pending review)* Page shell for `main-*` sections: `.page-shell`,
  `.page-shell__inner|title|rte|link|form|button|pagination`,
  `.page-shell--narrow|center`, `.page-shell__button--secondary`.
- *(pending review)* Section and class names `main-404`, `main-article`,
  `main-blog`, `main-cart`, `main-collection`, `main-list-collections`,
  `main-page`, `main-password`, `main-product`, `main-search` with
  `.main-cart*`, `.main-product*`, `.main-collection*`, `.main-collections*`,
  `.main-blog*`, `.main-article*`, `.main-search*`.
- *(pending review)* Header / footer classes `.site-header*`, `.site-footer*`;
  custom property `--site-header-logo-width`.
- Locale keys: `accessibility.skip_to_content`, `general.meta.*`,
  `general.header.*`, `general.footer.menu`, `general.pagination.label`,
  `general.slider.*`, `cart.quantity|subtotal|empty`, `collections.empty`,
  `products.product.*`, `onboarding.product_title`,
  `theme.components.product_card.*`, `theme.sections.classic.*`.

## Classic section motion and card hovers — 2026-10-10

No new prefix. Classic sections take Elewind's standard animation setting ids
`animation_enabled`, `animation_effect`, `animation_duration`,
`animation_delay`, `animation_stagger`, `animation_distance`,
`animation_ease`, `animation_once`. New custom property `--cls-hover-room`
(carousel room for the hover lift); new class `.main-collections__title`
styling hook on the existing element. Hovers reuse `--card-hover-lift`.

## Elewind cards and Section Design Mode — 2026-10-10

Nothing new named. Brought over unchanged: `snippets/collection-product-card.liquid`
(`opc-`), `snippets/collection-list-card.liquid` (`clc-`),
`assets/icon-bag.svg`, `assets/icon-arrow-diagonal.svg`; Elewind's Section
Design Mode setting ids (`section_design_mode`, `design_*`). Removed
`.opc-card__badge`. Locale keys `theme.components.product_card.add_to_cart`,
`theme.components.collection_card.products_count`,
`onboarding.collection_title`.

## Elewind featured families and card hover layer — 2026-10-10

Brought over unchanged with their Elewind names: `cfx-` (featured
collection), `afx-` / `arc-` (featured articles, article card), `bfx-` / `bcc-`
(featured blogs, blog cover card), `ldx-` (load state), `window.Loader`,
`Motion.whenSwiper`. Locale keys `theme.components.article_card.*`,
`theme.components.blog_card.*`. Nothing new named: the card hover layer reuses
`--card-hover-lift` and the cards' own classes.

## Cart push and collection list sections — 2026-10-10

Nothing new named. `data-opc-cart='slide'` keeps its id but now means "grows in
and pushes the title". Brought over with Elewind names: sections
`classic-collection-list-tabs`, `list-collections`; blocks `list_collections`,
`_collection_card`; `<container-carousel>`.

## Image, Video and Media Row sections — 2026-10-10

Nothing new named. Brought over with Elewind names: sections `image`, `video`,
`row-media`; blocks `_row_media`, `_row_media_item`, `_vertical_divider`;
snippet `media-overlay-tint` (`.mc-content`, `.media-tint`); `<video-section>`,
`<media-autoplay>`. Locale keys `theme.sections.video.close`,
`theme.sections.video.popover_title`, `theme.sections.video.watch_on_youtube`.

## FAQ section — 2026-10-10

Brought over with Elewind names: section `faq`, blocks `_faq_list`,
`_faq_item`, `_faq_question`; `.faq-section--{id}`, `.faq-list--{id}`,
`.faq-item*`, `--faq-*` custom properties, `data-faq-list`. New, inside the
existing `faq-` family: shared classes `.faq-section`, `.faq-section__inner`
(was `__inner--{id}`), `.faq-list`, `.faq-question`, `.faq-question--bold`;
custom property `--faq-min-height`. Locale key
`theme.components.faq_item.placeholder_question`.

## Block items grid, Before & After, Marquee, Announcement bar — 2026-10-10

Brought over with Elewind names: `big-` (block items grid), `block-item`,
`icon-block`, `ba-` (before & after), `badge`, `<before-after-slider>`,
`<global-countdown>`, marquee / `scrolling-*` classes, `--bar-cap-*`. New
setting id `layout` on Before & After (`split` | `slider`); new aspect ratio
value `screen` on `_before_after`. Locale keys
`theme.sections.announcement_bar.days|hours|minutes|seconds`,
`theme.sections.before_after.slider_label`.

## Image filled text (`ift-`) — 2026-10-10

Brought over with Elewind names (prefix chosen by the user there):
`blocks/image_filled_text.liquid`, `sections/image-filled-text.liquid`,
`assets/image-filled-text.js`, `<image-filled-text>`. Classes `.ift`,
`.ift--video`, `.ift__text|media|video`, `.is-masked`, `.ift-section`,
`.ift-section__inner`; hooks `data-ift-text`, `data-ift-media`; custom
properties `--ift-size|weight|line-height|family|style|align|position|fill`.
Setting ids `text`, `alignment_mobile`, `alignment_desktop`, `fill`, `image`,
`video`, `font_source`, `custom_font`, `font_weight`, `size_mobile`,
`size_desktop`, `line_height`.

## Inline image text (`iit-`) — 2026-10-11

Brought over with Elewind names (prefix chosen by the user there):
`sections/inline-image-text.liquid`, private blocks `_iit_bold_text`,
`_iit_italic_text`, `_iit_image`. Classes `.iit`, `.iit__inner`, `.iit__flow`,
`.iit-text`, `.iit-text--bold|italic`, `.iit-image`,
`.iit-image--pill|circle|rectangle|square`, `.iit-image--rounded|plain`,
`.iit-image__placeholder`; custom properties `--iit-family|size|align|weight`,
`--iit-image-size|ratio|h|mx|my`. Setting ids `alignment`, `font_source`,
`custom_font`, `font_size_mobile`, `font_size_desktop`, `color_scheme`, `text`,
`font_weight`, `image`, `shape`, `corners`, `size`, `width_ratio`, `margin_x`,
`margin_y`.
