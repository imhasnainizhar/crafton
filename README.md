# Crafton

A free, open-source Shopify theme for lightweight stores. Crafton is a
standard Online Store 2.0 theme: JSON templates and sections that merchants
add, remove and reorder in the theme editor. It is built with Liquid, CSS and
vanilla JavaScript with no build step. The only libraries, Swiper (carousels)
and GSAP (accent typography), load lazily and only when a section needs them.

It shares its foundation with the Elewind pro theme:

- **Color schemes** with base, surface, text, link, accent and border roles.
- **Design System**: responsive Modern / Minimal Design Modes with resolved
  spacing, gutter, width, radius, border and shadow tokens.
- **Typography**: heading, subtitle, body and accent font roles on a fluid
  seven-step type ladder.
- **Typography blocks**: Heading, Subtitle, Text, Rich text, Rich content,
  Button, Label, Caption and Accent line, plus Email signup.
- **Basic motion**: scroll entrances (fade, fade up, slide, scale, mask reveal)
  with staggered groups, all CSS, plus a global "Disable all animations" switch.

## Sections

- **Featured collection**: a Rich content intro over a collection's products,
  with an optional image or video hero, grid or carousel per breakpoint
  (overlap, bleed, edge fade, slide sizing), the full product card controls
  (plate, glass, float, price, compare-at price, cart button) and View more /
  Load more paging with loading placeholders.
- **Featured articles** and **Featured blogs**: the same hero and carousel
  engine, with composable article and blog cards (title, excerpt, author,
  date, read time, description).
- **Collection list**: collection cards as a grid or carousel per breakpoint,
  with plate, glass, float, icon and card colour controls.
- **Featured products**, **Classic collection tabs** and **Classic collection
  list**: a heading (and tabs) over product or collection cards, as a grid or a
  native scroll-snap carousel per breakpoint.
- **Newsletter**: typography blocks and an email signup form.

Every section has scroll entrances and a per-section Design Mode override.
Cards lift and zoom on hover; on product cards the add to cart button grows in
and pushes the title.

## Getting started

Install the [Shopify CLI](https://shopify.dev/docs/api/shopify-cli), then:

```bash
git clone https://github.com/imhasnainizhar/crafton.git
cd crafton
shopify theme dev
```

Lint with:

```bash
shopify theme check
```

## Theme architecture

```bash
.
├── assets          # base.css (tokens), motion, classic-tabs.js, icons
├── blocks          # Typography blocks and Email signup
├── config          # Global settings: colors, typography, Design System, animations
├── layout          # theme.liquid and password.liquid
├── locales         # Storefront and theme-editor strings
├── sections        # Classic sections, Newsletter, header / footer, main-* page sections
├── snippets        # Token resolvers, shared cards and section parts
└── templates       # JSON templates (gift_card.liquid is the one Liquid template)
```

Working rules for contributors and coding agents are in [AGENTS.md](./AGENTS.md).

## Contributing

Contributions are welcome. Please keep them lean: Crafton aims to stay light
and easy to read. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Crafton is open-sourced under the [MIT](./LICENSE) License.
