/* ==========================================================================
 * FEATURED COLLECTION (`cfx-`) — <collection-featured>
 *
 * One controller per section, one Stage object per Collection block inside it.
 * A stage does three things and nothing else:
 *   1. LAYOUT   — grid or carousel per breakpoint. Grid is the static markup;
 *      a carousel is Swiper built over the same track, torn down when the
 *      breakpoint asks for a grid again.
 *   2. BATCHES  — View More reveals what the first render is holding back
 *      (grid) or fetches the next page through the shared window.Loader.
 *   3. PRELOAD  — a carousel nearing its end asks for the next page silently.
 * Plus two pieces of geometry the block's CSS cannot know on its own:
 *   - EDGES     — the distance from the stage to each screen edge, published
 *     as --cfx-edge-start / --cfx-edge-end for the screen-edge fade. Measured
 *     from offsets, not getBoundingClientRect, so an entrance transform on the
 *     stage never skews it.
 *   - DIRECTION — a stage with `data-cfx-mirror` (hero on the right of a
 *     side-by-side carousel) runs its desktop carousel right to left, so cards
 *     still travel toward the hero. Swiper reads direction only at init, so a
 *     change of breakpoint that flips it rebuilds the carousel.
 *
 * CONTENT OVER HERO. A stage with `data-cfx-hero-content` takes the Rich
 * Content placed right before it in the section (every sibling back to the
 * previous stage) into its `[data-cfx-herocontent]` box, and puts it back
 * where it was when the stage disconnects, so a rebuild finds it in place.
 *
 * SLIDES are always `slidesPerView: 'auto'`: the block's CSS sizes each one
 * with a clamp() interpolated between the mobile and desktop slide widths.
 *
 * Every stage registers its listeners against its OWN AbortController. The
 * editor fires `shopify:section:load` on a section it has just re-rendered, so
 * a live host rebuilds on the same nodes; a listener tied to the host alone
 * would keep a replaced stage answering View More and preload events next to
 * its successor (two fetches, duplicated cards). The Swiper
 * lifecycle follows the theme's editor standard (see assets/container-carousel.js):
 * a ResizeObserver rebuilds a carousel first measured at zero width, a
 * MutationObserver re-tags slides swapped in underneath it, and teardown is
 * destroy(true, true) plus an explicit scrub of the styles Swiper leaves behind.
 *
 * LOADING shows card-shaped placeholders (window.Loader.Skeleton, one per
 * card the next page brings) for a tap and a preload alike, and the cards
 * enter in view with the section's cross-fade or fade-up.
 *
 * Depends on: window.Motion.whenSwiper (motion-reveal.js, loads Swiper), window.Loader.fetchItems +
 * window.Loader.State + window.Loader.Skeleton (loader-fetch.js,
 * loader-state.js), window.Motion (optional).
 * ========================================================================== */

(function () {
  if (customElements.get('collection-featured')) return;

  var DESKTOP = '(min-width: 768px)';
  var FALLBACK_GAP = 16;

  function num(value, fallback) {
    var n = parseFloat(value);
    return isNaN(n) ? fallback : n;
  }

  /* ----------------------------------------------------------------- stage */

  function Stage(root, host) {
    this.root = root;
    this.host = host;
    this.uid = root.getAttribute('data-cfx-panel') || '';
    this.viewport = root.querySelector('[data-cfx-viewport]');
    this.track = root.querySelector('[data-cfx-track]');
    this.items = root.querySelector('[data-cfx-items]');
    this.moreBtn = root.querySelector('[data-cfx-more]');
    this.moreWrap = root.querySelector('[data-cfx-more-wrap]');
    // Card-shaped placeholders for a batch in flight (loader-state.js).
    this.skeleton =
      window.Loader && window.Loader.Skeleton
        ? new window.Loader.Skeleton(root.querySelector('template[data-cfx-skeleton]'))
        : null;
    // The View collection tile shown once the product limit is reached.
    this.linkWrap = root.querySelector('[data-cfx-collection-wrap]');
    this.state = window.Loader && window.Loader.State ? window.Loader.State.from(root) : null;

    this.pages = parseInt(this.items && this.items.getAttribute('data-cfx-pages'), 10) || 1;
    this.page = parseInt(this.items && this.items.getAttribute('data-cfx-page'), 10) || 1;
    this.initial = parseInt(root.getAttribute('data-cfx-initial'), 10) || 0;
    this.batch = parseInt(root.getAttribute('data-cfx-step'), 10) || 8;
    this.max = parseInt(root.getAttribute('data-cfx-max'), 10) || Infinity;
    this.total = parseInt(root.getAttribute('data-cfx-total'), 10) || Infinity;
    this.failed = false;

    this.layout = 'grid';
    this.swiper = null;
    this.fetching = false;
    this.exhausted = this.page >= this.pages;
    this.lastWidth = 0;
    this.mirror = root.hasAttribute('data-cfx-mirror');
    this.heroBox = root.querySelector('[data-cfx-herocontent]');
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
    if (this.moreBtn) {
      this.moreBtn.addEventListener(
        'click',
        function (event) {
          event.preventDefault();
          this.more();
        }.bind(this),
        { signal: signal }
      );
    }

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

    this.refreshMore();
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
      root.querySelectorAll('.cfx-fade--start').forEach(function (el) {
        if (el.style.getPropertyValue('--cfx-edge-start') !== start) el.style.setProperty('--cfx-edge-start', start);
      });
      root.querySelectorAll('.cfx-fade--end').forEach(function (el) {
        if (el.style.getPropertyValue('--cfx-edge-end') !== end) el.style.setProperty('--cfx-edge-end', end);
      });
    });
  };

  Stage.prototype.observeTrack = function () {
    if (this.mo && this.track) this.mo.observe(this.track, { childList: true });
  };

  Stage.prototype.disconnect = function () {
    this.teardownSwiper();
    if (this.skeleton) this.skeleton.destroy();
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
    if (!this.heroBox || !this.root.hasAttribute('data-cfx-hero-content')) return;
    var nodes = [];
    for (var el = this.root.previousElementSibling; el; el = el.previousElementSibling) {
      if (el.hasAttribute('data-cfx-stage')) break;
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
    this.layout = this.root.getAttribute(isDesktop ? 'data-cfx-layout-desktop' : 'data-cfx-layout-mobile') || 'grid';
    this.root.setAttribute('data-cfx-active-layout', this.layout);

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

  Stage.prototype.slideEls = function () {
    if (!this.track) return [];
    return Array.prototype.filter.call(this.track.children, function (el) {
      return el.hasAttribute('data-cfx-item');
    });
  };

  /** Where appended cards go: before the View More cell and the skeleton. */
  Stage.prototype.tail = function () {
    if (!this.track) return null;
    for (var i = 0; i < this.track.children.length; i++) {
      var el = this.track.children[i];
      if (el.hasAttribute('data-cfx-more-wrap') ||
        el.hasAttribute('data-cfx-collection-wrap') ||
        el.hasAttribute('data-ldx-skeleton')) return el;
    }
    return null;
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

    var styles = getComputedStyle(this.root);
    var gapMobile = num(styles.getPropertyValue('--ds-item-gap-mobile'), FALLBACK_GAP);
    var gapDesktop = num(styles.getPropertyValue('--ds-item-gap-desktop'), gapMobile);

    var breakpoints = {};
    // The block's CSS sizes every slide (a fluid width); Swiper only follows.
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
      a11y: { enabled: true },
      on: {
        slideChange: this.checkEnd.bind(this),
        reachEnd: this.checkEnd.bind(this),
        resize: this.checkEnd.bind(this)
      }
    });
    this.checkEnd();
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

    Array.prototype.forEach.call(this.track.children, function (el) {
      var tag = el.tagName;
      if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'LINK' || tag === 'TEMPLATE') return;
      if (!el.classList.contains('swiper-slide')) el.classList.add('swiper-slide');
    });

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

  /* --------------------------------------------------------------- batches */

  /** Grid only: cards the first render holds back behind "shown at first". */
  Stage.prototype.heldBack = function () {
    if (this.layout !== 'grid' || !this.initial) return [];
    return this.slideEls()
      .slice(this.initial)
      .filter(function (el) {
        return !el.hasAttribute('data-cfx-revealed');
      });
  };

  Stage.prototype.done = function () {
    return this.exhausted && !this.heldBack().length;
  };

  /** View More: reveal what the first render holds back, else fetch a page. */
  Stage.prototype.more = function () {
    var held = this.heldBack();
    if (!held.length) {
      this.fetchNext(false);
      return;
    }
    held.slice(0, this.batch).forEach(
      function (el) {
        el.setAttribute('data-cfx-revealed', 'true');
        if (this.skeleton) this.skeleton.enter(el);
      }.bind(this)
    );
    this.afterItems();
  };

  /**
   * Auto-load: fetch quietly once the carousel is within `threshold` cards of
   * its end. Runs on init too, so a first batch that already fits the screen
   * (nothing to swipe, no slideChange ever) still loads the next one.
   */
  Stage.prototype.checkEnd = function () {
    if (!this.host.autoLoad || !this.swiper || this.fetching || this.exhausted) return;
    var remaining = this.slideEls().length - (this.swiper.activeIndex + this.swiper.slidesPerViewDynamic());
    if (remaining <= this.host.threshold) this.fetchNext(true);
  };

  /** One page from the Section Rendering API; `silent` is the carousel preload. */
  Stage.prototype.fetchNext = function (silent) {
    if (this.fetching || this.exhausted || !window.Loader || !window.Loader.fetchItems) return;
    var next = this.page + 1;
    this.setBusy(true, silent);

    window.Loader.fetchItems({
      basePath: this.host.basePath,
      sectionId: this.host.sectionId,
      page: next,
      selector: '[data-cfx-panel="' + this.uid + '"] [data-cfx-item]',
      skipAssets: !!silent,
      signal: this.host.signal
    })
      .then(
        function (nodes) {
          this.page = next;
          if (this.page >= this.pages) this.exhausted = true;
          var added = this.append(nodes);
          if (this.skeleton) this.skeleton.settle(added);
          this.setBusy(false, silent);
          this.afterItems();
        }.bind(this)
      )
      .catch(
        function (error) {
          if (error && error.name === 'AbortError') return;
          var kind = error && error.ldxKind;
          if (this.skeleton) this.skeleton.clear();
          this.setBusy(false, silent);
          // An empty page only means the list ended sooner than counted.
          if (kind === window.Loader.KIND.EMPTY) {
            this.exhausted = true;
            this.refreshMore();
            return;
          }
          // A background preload never puts an error in front of anyone.
          if (silent || !this.state) return;
          this.failed = true;
          this.refreshMore();
          this.state.fail(
            kind,
            function () {
              this.fetchNext(false);
            }.bind(this)
          );
        }.bind(this)
      );
  };

  /**
   * Busy: placeholder cards stand in for the batch, whether a tap or a
   * preload asked for it. They are settled (or cleared) by fetchNext, never
   * here, so the swap happens in the same frame as the append.
   */
  Stage.prototype.setBusy = function (busy, silent) {
    this.fetching = busy;
    if (busy && this.skeleton && this.track) {
      if (this.mo) this.mo.disconnect();
      this.skeleton.show(this.track, this.tail(), this.expected());
      if (this.mo) this.observeTrack();
      if (this.swiper) this.swiper.update();
    }
    if (silent) return;
    if (this.moreBtn) {
      if (busy) this.moreBtn.setAttribute('aria-busy', 'true');
      else this.moreBtn.removeAttribute('aria-busy');
    }
    if (busy) {
      this.failed = false;
      if (this.state) this.state.clear();
      this.refreshMore();
    }
  };

  /** New cards go before the View More cell, never past "Products to show". */
  Stage.prototype.append = function (nodes) {
    if (!this.track) return [];
    var room = this.max - this.slideEls().length;
    if (nodes.length >= room) {
      nodes = nodes.slice(0, Math.max(0, room));
      this.exhausted = true;
    }
    if (this.mo) this.mo.disconnect();
    var tail = this.tail();
    nodes.forEach(
      function (node) {
        node.setAttribute('data-cfx-revealed', 'true');
        node.classList.add('cfx-slide', 'swiper-slide');
        this.track.insertBefore(node, tail);
      }.bind(this)
    );
    if (this.mo) this.observeTrack();
    return nodes;
  };

  /** How many cards the next page will bring: one placeholder for each. */
  Stage.prototype.expected = function () {
    var total = isFinite(this.total) ? this.total : this.max;
    return Math.max(0, Math.min(this.batch, total - this.slideEls().length));
  };

  Stage.prototype.afterItems = function () {
    this.refreshMore();
    if (this.swiper) this.swiper.update();
    this.checkEnd();
  };

  /**
   * The loading button retires when done, and steps aside for an error. The
   * View collection tile (rendered only when the product limit cuts the
   * collection short) takes its place once everything allowed is showing.
   */
  Stage.prototype.refreshMore = function () {
    var changed = false;
    if (this.moreWrap && this.moreBtn) {
      var hide = this.failed || this.done();
      if (this.moreWrap.hidden !== hide) {
        this.moreWrap.hidden = hide;
        changed = true;
      }
    }
    if (this.linkWrap) {
      var hideLink = this.failed || !this.done();
      if (this.linkWrap.hidden !== hideLink) {
        this.linkWrap.hidden = hideLink;
        changed = true;
      }
    }
    if (changed && this.swiper) this.swiper.update();
  };

  /* ------------------------------------------------------------------ host */

  class CollectionFeatured extends HTMLElement {
    connectedCallback() {
      if (this.stages) return;
      this.controller = new AbortController();
      this.signal = this.controller.signal;
      this.sectionId = this.getAttribute('data-cfx-section-id') || '';
      this.basePath = this.getAttribute('data-cfx-base-path') || window.location.pathname;
      this.autoLoad = this.getAttribute('data-cfx-carousel-load') !== 'button';
      this.threshold = parseInt(this.getAttribute('data-cfx-preload-threshold'), 10) || 3;

      this.build();

      this.mql = window.matchMedia(DESKTOP);
      var onBreakpoint = function (event) {
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
          var root = event.target.closest ? event.target.closest('[data-cfx-stage]') : null;
          var stage = root ? this.stageFor(root) : null;
          if (stage) stage.scheduleSync();
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
        this.querySelectorAll('[data-cfx-stage]'),
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

  customElements.define('collection-featured', CollectionFeatured);
})();
