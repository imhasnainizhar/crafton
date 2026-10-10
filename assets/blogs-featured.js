/* ==========================================================================
 * FEATURED BLOGS (`bfx-`) — <blogs-featured>
 *
 * One controller per section, one Stage object per Featured Blogs block
 * inside it. Cloned from Featured Collections
 * (assets/collections-featured.js) and kept independent of it: the cards are
 * hand-picked Blog Card blocks, all
 * rendered at once, so there is nothing to load. A stage does:
 *   1. LAYOUT   — grid or carousel per breakpoint. Grid is the static markup;
 *      a carousel is Swiper built over the same track, torn down when the
 *      breakpoint asks for a grid again.
 *   2. SLIDES   — Blog Card children land in the track untagged (a
 *      null-tag block has no wrapper), so every child is tagged `swiper-slide`
 *      before Swiper is built and again whenever the editor swaps one in.
 * Plus two pieces of geometry the block's CSS cannot know on its own:
 *   - EDGES     — the distance from the stage to each screen edge, published
 *     as --bfx-edge-start / --bfx-edge-end for the screen-edge fade. Measured
 *     from offsets, not getBoundingClientRect, so an entrance transform on the
 *     stage never skews it.
 *   - DIRECTION — a stage with `data-bfx-mirror` (hero on the right of a
 *     side-by-side carousel) runs its desktop carousel right to left, so cards
 *     still travel toward the hero. Swiper reads direction only at init, so a
 *     change of breakpoint that flips it rebuilds the carousel.
 *
 * CONTENT OVER HERO. A stage with `data-bfx-hero-content` takes the Rich
 * Content placed right before it in the section (every sibling back to the
 * previous stage) into its `[data-bfx-herocontent]` box, and puts it back
 * where it was when the stage disconnects, so a rebuild finds it in place.
 *
 * SLIDES are always `slidesPerView: 'auto'`: the block's CSS sizes each one
 * (a fluid width, or a count of slides per view).
 *
 * Every stage registers its listeners against its OWN AbortController, and
 * the Swiper lifecycle follows the theme's editor standard (see
 * assets/container-carousel.js): a ResizeObserver rebuilds a carousel first
 * measured at zero width, a MutationObserver re-tags slides swapped in
 * underneath it, and teardown is destroy(true, true) plus an explicit scrub of
 * the styles Swiper leaves behind.
 *
 * Depends on: window.Motion (motion-reveal.js; whenSwiper loads Swiper).
 * ========================================================================== */

(function () {
  if (customElements.get('blogs-featured')) return;

  var DESKTOP = '(min-width: 768px)';
  var FALLBACK_GAP = 16;
  var SKIP = { STYLE: 1, SCRIPT: 1, LINK: 1, TEMPLATE: 1 };

  function num(value, fallback) {
    var n = parseFloat(value);
    return isNaN(n) ? fallback : n;
  }

  /* ----------------------------------------------------------------- stage */

  function Stage(root, host) {
    this.root = root;
    this.host = host;
    this.viewport = root.querySelector('[data-bfx-viewport]');
    this.track = root.querySelector('[data-bfx-track]');

    this.layout = 'grid';
    this.swiper = null;
    this.waiting = false;
    this.lastWidth = 0;
    this.mirror = root.hasAttribute('data-bfx-mirror');
    this.heroBox = root.querySelector('[data-bfx-herocontent]');
    this.heroNodes = [];
    this.heroAnchor = null;
    this.controller = null;
    this.dir = 'ltr';

    this.ro = null;
    this.edgeRo = null;
    this.mo = null;
    this.syncScheduled = false;
  }

  Stage.prototype.connect = function () {
    this.controller = new AbortController();
    var signal = this.controller.signal;
    this.placeHero();
    this.tagSlides();

    if (this.viewport && window.ResizeObserver) {
      this.ro = new ResizeObserver(
        function (entries) {
          var width = entries[0] ? entries[0].contentRect.width : 0;
          // The editor re-renders a section into a subtree with no layout, so
          // Swiper measures 0 and no window resize ever follows: the first real
          // width is the only signal that the carousel has to be rebuilt.
          if (this.lastWidth === 0 && width > 0) {
            this.lastWidth = width;
            this.applyLayout();
          } else {
            this.lastWidth = width;
            if (this.swiper) this.scheduleSync();
          }
        }.bind(this)
      );
      this.ro.observe(this.viewport);
    }

    if (this.track && window.MutationObserver) {
      this.mo = new MutationObserver(this.scheduleSync.bind(this));
      this.observeTrack();
    }

    var measure = this.measureEdges.bind(this);
    if (window.ResizeObserver) {
      // The full-bleed section too: a scrollbar appearing shifts a centred
      // stage without resizing it, and fires no window resize.
      this.edgeRo = new ResizeObserver(measure);
      this.edgeRo.observe(this.root);
      this.edgeRo.observe(this.host);
    }
    window.addEventListener('resize', measure, { signal: signal });
    this.measureEdges();
  };

  /** Distance from the stage to each screen edge, for the edge fade. */
  Stage.prototype.measureEdges = function () {
    // Measured through Motion.measure (an IntersectionObserver entry), so it
    // forces no layout; rounded like offsetLeft / offsetWidth. The values are
    // written on the two fade strips that read them, not on the root: a custom
    // property set on the root would restyle every element below it.
    var root = this.root;
    window.Motion.measure(root, function (box, viewportWidth) {
      var width = Math.round(box.width);
      if (!width) return;
      var left = Math.round(box.left); // the page never scrolls sideways
      var start = Math.max(0, left) + 'px';
      var end = Math.max(0, viewportWidth - left - width) + 'px';
      root.querySelectorAll('.bfx-fade--start').forEach(function (el) {
        if (el.style.getPropertyValue('--bfx-edge-start') !== start) el.style.setProperty('--bfx-edge-start', start);
      });
      root.querySelectorAll('.bfx-fade--end').forEach(function (el) {
        if (el.style.getPropertyValue('--bfx-edge-end') !== end) el.style.setProperty('--bfx-edge-end', end);
      });
    });
  };

  Stage.prototype.observeTrack = function () {
    if (this.mo && this.track) this.mo.observe(this.track, { childList: true });
  };

  Stage.prototype.disconnect = function () {
    this.teardownSwiper();
    if (this.ro) this.ro.disconnect();
    if (this.mo) this.mo.disconnect();
    if (this.edgeRo) this.edgeRo.disconnect();
    if (this.controller) this.controller.abort();
    this.controller = null;
    this.restoreHero();
  };

  /**
   * Content over hero: move every sibling between the previous stage and this
   * one (the Rich Content the merchant placed right before it) into the hero.
   * Style/script siblings travel too, so nothing empty is left in the column.
   */
  Stage.prototype.placeHero = function () {
    if (!this.heroBox || !this.root.hasAttribute('data-bfx-hero-content')) return;
    var nodes = [];
    for (var el = this.root.previousElementSibling; el; el = el.previousElementSibling) {
      if (el.hasAttribute('data-bfx-stage')) break;
      nodes.unshift(el);
    }
    if (!nodes.length) return;
    this.heroAnchor = this.root;
    this.heroNodes = nodes;
    nodes.forEach(
      function (node) {
        this.heroBox.appendChild(node);
      }.bind(this)
    );
  };

  Stage.prototype.restoreHero = function () {
    var anchor = this.heroAnchor;
    if (!anchor || !anchor.parentNode) return;
    this.heroNodes.forEach(function (node) {
      anchor.parentNode.insertBefore(node, anchor);
    });
    this.heroNodes = [];
    this.heroAnchor = null;
  };

  /* ---------------------------------------------------------------- layout */

  Stage.prototype.applyLayout = function (isDesktop) {
    if (isDesktop === undefined) isDesktop = window.matchMedia(DESKTOP).matches;
    this.layout = this.root.getAttribute(isDesktop ? 'data-bfx-layout-desktop' : 'data-bfx-layout-mobile') || 'grid';
    this.root.setAttribute('data-bfx-active-layout', this.layout);

    // Direction is read once at init: a flip means a rebuild. The attribute is
    // set even for a grid, so a torn-down carousel never leaves a grid mirrored.
    var dir = isDesktop && this.mirror ? 'rtl' : 'ltr';
    if (dir !== this.dir) {
      this.teardownSwiper();
      this.dir = dir;
    }
    if (this.viewport) this.viewport.setAttribute('dir', this.dir);

    if (this.layout === 'carousel') {
      this.buildSwiper();
    } else {
      this.teardownSwiper();
    }
  };

  Stage.prototype.buildSwiper = function () {
    if (!this.viewport || !this.track) return;
    if (this.swiper) {
      this.scheduleSync();
      return;
    }
    if (!this.inRange) {
      // Swiper loads once per page; the carousel builds once it is within a
      // screen of view (Motion.whenSwiper, assets/motion-reveal.js).
      if (this.waiting) return;
      this.waiting = true;
      window.Motion.whenSwiper(this.root, function () {
        this.waiting = false;
        this.inRange = true;
        if (!this.root.isConnected || this.layout !== 'carousel') return;
        this.buildSwiper();
      }.bind(this));
      return;
    }

    this.tagSlides();

    var styles = getComputedStyle(this.root);
    var gapMobile = num(styles.getPropertyValue('--ds-item-gap-mobile'), FALLBACK_GAP);
    var gapDesktop = num(styles.getPropertyValue('--ds-item-gap-desktop'), gapMobile);

    var breakpoints = {};
    // The block's CSS sizes every slide; Swiper only follows.
    breakpoints[768] = { slidesPerView: 'auto', spaceBetween: gapDesktop };

    this.swiper = new window.Swiper(this.viewport, {
      slidesPerView: 'auto',
      spaceBetween: gapMobile,
      breakpoints: breakpoints,
      watchOverflow: true,
      centerInsufficientSlides: true,
      observer: true,
      observeParents: true,
      watchSlidesProgress: true,
      keyboard: { enabled: true, onlyInViewport: true },
      // No slide role: slides are <article>, whose implicit role must stand.
      a11y: { enabled: true, slideRole: null }
    });
  };

  /** Every element child of the track is a slide: the cards and the View all tile. */
  Stage.prototype.tagSlides = function () {
    if (!this.track) return;
    Array.prototype.forEach.call(this.track.children, function (el) {
      if (SKIP[el.tagName]) return;
      if (!el.classList.contains('swiper-slide')) el.classList.add('swiper-slide');
    });
  };

  Stage.prototype.scheduleSync = function () {
    if (this.syncScheduled) return;
    this.syncScheduled = true;
    requestAnimationFrame(
      function () {
        this.syncScheduled = false;
        this.sync();
      }.bind(this)
    );
  };

  /** Re-tag anything that landed in the track untagged, then let Swiper remeasure. */
  Stage.prototype.sync = function () {
    if (!this.track) return;
    if (this.mo) this.mo.disconnect();
    this.tagSlides();
    if (this.swiper) this.swiper.update();
    if (this.mo) this.observeTrack();
  };

  Stage.prototype.teardownSwiper = function () {
    if (!this.swiper) return;
    try {
      this.swiper.destroy(true, true);
    } catch (e) {
      /* a destroyed instance is still a destroyed instance */
    }
    this.swiper = null;

    // cleanStyles leaves the initialized class and inline sizing behind, which
    // is exactly what the static grid rules select against.
    if (this.track) {
      this.track.style.transform = '';
      this.track.style.transitionDuration = '';
      Array.prototype.forEach.call(this.track.children, function (el) {
        el.style.width = '';
        el.style.marginRight = '';
        el.style.marginLeft = '';
      });
    }
    if (this.viewport) this.viewport.classList.remove('swiper-initialized');
  };

  /* ------------------------------------------------------------------ host */

  class BlogsFeatured extends HTMLElement {
    connectedCallback() {
      if (this.stages) return;
      this.controller = new AbortController();
      this.signal = this.controller.signal;

      this.build();

      this.mql = window.matchMedia(DESKTOP);
      var onBreakpoint = function (event) {
        if (!this.stages) return;
        this.stages.forEach(function (stage) {
          stage.applyLayout(event.matches);
        });
      }.bind(this);
      if (this.mql.addEventListener) {
        this.mql.addEventListener('change', onBreakpoint, { signal: this.signal });
      }

      document.addEventListener(
        'shopify:section:load',
        function (event) {
          if (event.target && event.target.contains(this)) this.rebuild();
        }.bind(this),
        { signal: this.signal }
      );
      document.addEventListener(
        'shopify:section:unload',
        function (event) {
          if (event.target && event.target.contains(this)) this.destroyStages();
        }.bind(this),
        { signal: this.signal }
      );
      document.addEventListener(
        'shopify:block:select',
        function (event) {
          if (!this.contains(event.target)) return;
          var root = event.target.closest ? event.target.closest('[data-bfx-stage]') : null;
          var stage = root ? this.stageFor(root) : null;
          if (!stage) return;
          stage.scheduleSync();
          // A selected card scrolls into the carousel's view.
          if (stage.swiper && root !== event.target) {
            var index = stage.swiper.slides.indexOf(event.target);
            if (index > -1) stage.swiper.slideTo(index);
          }
        }.bind(this),
        { signal: this.signal }
      );
      document.addEventListener(
        'shopify:section:select',
        function (event) {
          if (event.target && event.target.contains(this)) this.syncAll();
        }.bind(this),
        { signal: this.signal }
      );
    }

    disconnectedCallback() {
      this.destroyStages();
      if (this.controller) this.controller.abort();
      this.controller = null;
    }

    build() {
      var isDesktop = window.matchMedia(DESKTOP).matches;
      this.stages = Array.prototype.map.call(
        this.querySelectorAll('[data-bfx-stage]'),
        function (root) {
          var stage = new Stage(root, this);
          stage.connect();
          stage.applyLayout(isDesktop);
          return stage;
        }.bind(this)
      );
      // Hero content is in place: the pre-JS "held for a hero" rule may lift.
      this.classList.add('is-ready');
    }

    rebuild() {
      this.destroyStages();
      this.build();
    }

    destroyStages() {
      if (!this.stages) return;
      this.stages.forEach(function (stage) {
        stage.disconnect();
      });
      this.stages = null;
    }

    stageFor(root) {
      if (!this.stages) return null;
      for (var i = 0; i < this.stages.length; i++) {
        if (this.stages[i].root === root) return this.stages[i];
      }
      return null;
    }

    syncAll() {
      if (!this.stages) return;
      this.stages.forEach(function (stage) {
        stage.scheduleSync();
      });
    }
  }

  customElements.define('blogs-featured', BlogsFeatured);
})();
