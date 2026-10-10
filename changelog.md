# Changelog

## 2026-10-10 — Crafton on the Elewind foundation (branch `elewind-conventions`)

Switched Crafton from the block-first developer-preview skeleton (Liquid
templates with `{% block %}` / `{% partial %}`, which only run on preview dev
stores) to standard Online Store 2.0: JSON templates, sections and theme
blocks. The block-first version stays on `new-sections`.

### Foundation (from Elewind, unchanged in behaviour)

- Color scheme system: `config/settings_schema.json` color scheme group and
  role mapping in `snippets/theme-styles.liquid`, plus `accent-resolver`,
  `accent-contrast-resolver`, `background-role-token`, `color-role-resolver`.
  The scheme's scrollbar colours were dropped (no custom scrollbars).
- Design System: Design Mode + Design System settings, `design-system-vars`,
  `section-design-mode`, `space-token`, `cap-token`, `shadow-token`,
  `alignments`, `assets/base.css` tokens.
- Font system: heading / subtitle / body / accent roles, `typography-resolver`,
  `type-constants`, `fluid-clamp`, accent typography, overflow text.
- Typography blocks: heading, subtitle, text, rich_text, rich_content, button,
  label, caption, _accent_line; plus email_signup.
- Theme presets Crafton (Elewind's palette), Oldino, Minimi, Moderino, Choco.

### Simplified

- Motion: only the CSS entrance system (`motion-reveal`). Removed the motion
  engine, scroll scrub, parallax and split-text effects; Rich content's
  "The text itself" animation scope and its typing / fill settings are gone.
- Carousels: native CSS scroll-snap instead of Swiper; `classic-tabs.js`
  drives tabs and arrows only.
- Collection Product Card: tint plate only; added Sale / Sold out badges and
  "From" prices; removed glass / solid / floating plates, the unwired add to
  cart button and the loading skeleton.
- Removed: custom scrollbars, variant swatch tokens, `global.js`, GSAP
  preloads (GSAP now loads lazily only for accent typography).

### Added

- Sections: Featured collection, Featured articles, Featured blogs (classic
  `cls-` family), header / footer with groups, `main-*` page sections on a
  shared page shell.
- Featured products and Classic collection tabs: Animations group (on / off,
  effect) driving staggered card entrances.
- `snippets/classic-blog-card.liquid`; `classic-head` "View all" link.

### Fixed while porting

- Color scheme defaults `scheme-1` → `scheme_1` (the ids in settings data).
- Rich content's color scheme default `"scheme-1.;/#"` → `scheme_1`.
- Classic head pill tabs read undefined `--color-button*`; now the accent role.

## 2026-10-10 — Elewind fade up and card hovers

- Classic sections (Featured products, Featured collection, Classic
  collection tabs, Featured articles, Featured blogs) now carry Elewind's
  standard Animations group: effect, duration, delay, stagger, distance,
  easing and play-once, printed as `motion-reveal` timing variables on the
  section root. The heading and the card track (staggered) inherit them.
- Card hovers (pointer devices only; off under reduced motion and
  "Disable all animations"): the product card lifts with `--card-hover-lift`,
  casts a soft scheme shadow and zooms its image; article / blog, collection
  list and search cards lift their picture, zoom the image and draw a title
  underline in. Carousel arrows fill with the accent colour on hover.
- Carousel viewports get `--cls-hover-room` so lifted cards are not clipped
  by the scroller.

## 2026-10-10 — Elewind cards and Section Design Mode

- Product card: `snippets/collection-product-card.liquid` is Elewind's again,
  unchanged (all plate / float / cart / icon / skeleton variants, the
  placeholder add to cart button, image zoom 1.04 on hover). The simplified
  version, its badges, "From" prices and hover lift are gone.
- Collection card: Elewind's `snippets/collection-list-card.liquid` (`clc-`),
  unchanged, now renders the collections list page (`main-list-collections`:
  Card shape and Show product count settings). Hover is the card's own: image
  zoom and the arrow growing in.
- Design System: the five classic sections now take the Section Design Mode
  override (Auto / Blend / Custom) from Elewind's contract, rendered through
  `snippets/section-design-mode.liquid` on the section root. Only the settings
  the classic markup consumes: Design Mode, section padding, layout gap,
  gutter, section width and item styling (gap, radius, shadow, border); no
  layout-surface radius or border.
- Article and search card image zoom matched to Elewind's 1.04.

## 2026-10-10 — Elewind featured families and card hovers

- Featured collection, Featured articles and Featured blogs are Elewind's
  sections again, unchanged, replacing Crafton's thin classic versions: Rich
  content intro, image / video hero, carousel styles (overlap, bleed, edge
  fade, slide sizing), full product card controls, View more / Load more with
  skeletons, composable article and blog cards. New files: `_cfx_collection`,
  `_afx_feature`, `_bfx_feature`, `article_card`, `blog_cover_card`,
  `_article_*`, `_blog_*`, `cfx-hero-card`, `glass-resolver`, `ldx-state`,
  `collection-featured.js`, `articles-featured.js`, `blogs-featured.js`,
  `loader-fetch.js`, `loader-state.js`, Swiper, `icon-cart.svg`,
  `icon-plus.svg`. Removed `snippets/classic-blog-card.liquid`.
- `assets/motion-reveal.js` is Elewind's again (lazy loaders `Motion.loadGsap`,
  `Motion.loadScript`, `Motion.whenSwiper`, `Motion.measure`); the layout links
  Swiper's CSS and publishes `window.__motionAssets`.
- Card hover layer in `assets/base.css`: product, collection, article and blog
  cards lift with `--card-hover-lift` and a soft scheme shadow on hover, on top
  of each card's own image zoom. The Elewind card files stay untouched.
- Homepage template rebuilt from the featured sections' own presets.

## 2026-10-10 — Product card cart push, collection list sections

- Product card `slide` cart mode reworked: on hover / keyboard focus the add to
  cart button grows in (width, margin, scale, fade) and pushes the title, which
  truncates further; closed, the title uses the whole plate. Touch screens keep
  the button shown; reduced motion drops the transition. Featured products,
  Classic collection tabs and the collection page now use it
  (`data-opc-cart="slide"` on their card container); Featured collection
  already defaults to it through its own setting.
- Classic collection list (`classic-collection-list-tabs`, Elewind's classic
  tabbed collections) on Crafton's classic standard: native scroll-snap
  carousel, standard Animations group, Section Design Mode panel.
- Collection list (`list-collections` + `list_collections` + `_collection_card`
  blocks, `assets/container-carousel.js`), Elewind's, unchanged. Restored
  Elewind's `container-carousel` hover-bleed rules in `assets/base.css`.
- Homepage: Collection list and Classic collection list added.

## 2026-10-10 — Image, Video and Media Row sections

Elewind's media sections, media only. Everything else is unchanged from Elewind.

- Image (`sections/image.liquid`) and Video (`sections/video.liquid`,
  `assets/video-section.js`): the content layer takes only the Heading block
  (no Rich content, text, subtitle, button or other blocks); the presets ship
  one heading. They share `snippets/media-overlay-tint.liquid`.
- Media Row (`sections/row-media.liquid`, `blocks/_row_media.liquid`,
  `blocks/_row_media_item.liquid`, `blocks/_vertical_divider.liquid`,
  `assets/media-block.js`): no floating text. Dropped the "Media Row with
  Text" preset and its Floating Content settings. The row takes Row Media
  Items and Vertical Dividers only (not Elewind's `_media` block).
- Vertical Divider: line only. Its overlay text settings are gone.
- Dropped Image's parallax (Crafton has none). Media zoom no longer checks
  Elewind's global "Enable media animations" setting, which Crafton doesn't
  have; "Disable all animations" still turns it off.
- Image's Overlay Opacity now shows only in Overlay mode, as in Video.
- Video's popover strings moved to `theme.sections.video.*` locale keys.

## 2026-10-10 — FAQ section

Elewind's FAQ (`sections/faq.liquid`, `blocks/_faq_list.liquid`,
`blocks/_faq_item.liquid`, `blocks/_faq_question.liquid`), without background
media. Everything else is unchanged from Elewind.

- No background image or video: the color scheme paints the section. Dropped
  the Background settings (mobile / desktop type, images, videos, loop,
  overlay opacity), the overlay and the `media-block.js` load. Full screen
  height and minimum height stay, under a Height header.
- CSS split per Crafton's rules: static rules in each file's `{% stylesheet %}`
  on the shared classes `.faq-section`, `.faq-list`, `.faq-question`; the
  scoped `{% style %}` tags only set custom properties.
- Desktop item border and radius now read the item tokens
  (`--ds-item-border-width-desktop`, `--ds-item-radius-desktop`) instead of
  Elewind's layout tokens, so "Item radius (desktop)" applies on desktop.
- Question Text's bold setting is a modifier class instead of an inline style.
- The empty-question fallback uses the locale key
  `theme.components.faq_item.placeholder_question`.

## 2026-10-10 — Block items grid, Before & After, Marquee, Announcement bar

Elewind's sections, brought over unchanged except where noted.

- Block Items Grid (`sections/block-items-grid.liquid`, blocks
  `_block_items_grid`, `_block_item`, `icon`, `_number`, `image`, snippet
  `carousel-preinit-width`). The carousel runs on the existing
  `<container-carousel>`; stat numbers on `assets/stats-counter.js`.
- Before & After (`sections/before-and-after.liquid`, blocks `_before_after`,
  `_before_slide`, `_after_slide`, `_badge`, `_badge_text`, `_badge_icon`,
  `_verification_icon`, snippet `badge`, `assets/before-after.js`).
  - New Layout setting: "Text and slider" (Elewind's row) or "Slider only",
    which skips the Rich content block and lets the slider span the section,
    like the slider in Elewind's Comparison Editorial. The row settings hide
    while Slider only is on.
  - New preset "Before & After full width" (slider only, 21:9 desktop, 3:4
    mobile, sweep in on scroll).
  - The slider's aspect ratios add Ultrawide (21:9), Portrait (4:5) and Full
    screen (viewport height).
  - Before / After slides take Rich content and Badge children only (not
    Elewind's Group block).
- Marquee (`sections/marquee.liquid`, blocks `_marquee_item`, `_marquee_text`,
  `_marquee_icon`, `brand_icon`, `assets/marquee.js`, snippet `bar-cap-vars`).
- Announcement bar (`sections/announcement-bar.liquid`, reuses
  `assets/marquee.js`). Not added to the header group; merchants add it there.
- Icon block: removed Elewind's draw-on animation settings and markup. They
  were never wired (`draw_on` was never assigned), and their scrub mode would
  need GSAP.
- Storefront strings moved to locale keys: `theme.sections.announcement_bar.*`
  (countdown labels), `theme.sections.before_after.slider_label`.

## 2026-10-10 — Image filled text

- New section **Image filled text** (Text & content) and public theme block **Image filled
  text**, from Elewind unchanged: rich text whose letters are filled with an image or a looping
  muted video (Shopify's sample clothing illustration when none is chosen), with mobile and
  desktop alignment, font (theme body text by default, theme heading or custom), thickness,
  line spacing and a size that grows linearly from mobile to desktop, up to 380px. Images use
  `background-clip: text`; video mode masks the video to the letters with
  `assets/image-filled-text.js` (`<image-filled-text>`), playing only while on screen.
- Files: `blocks/image_filled_text.liquid`, `sections/image-filled-text.liquid`,
  `assets/image-filled-text.js`.
