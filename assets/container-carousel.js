if (!customElements.get('container-carousel')) {
  class ContainerCarousel extends HTMLElement {
    /*
     * THEME EDITOR RESILIENCE — the standard every Swiper in this theme follows.
     *
     * A merchant editing settings must never be left with a dead carousel that
     * only comes back after Save. Three things break a naively initialized
     * Swiper in the editor, and all three are handled here:
     *
     *   1. Init at zero width. The editor re-renders a section into a subtree
     *      that has not been laid out (or is inside a hidden tab panel), so
     *      Swiper measures 0 and computes garbage slide widths. No window
     *      resize ever follows, so it never self-corrects. -> ResizeObserver on
     *      .swiper re-runs update() the moment a real width appears.
     *   2. Children swapped underneath it. Adding / removing / reordering a
     *      child block can re-render just that block, leaving a new element in
     *      .swiper-wrapper that carries no .swiper-slide class and that Swiper
     *      has never measured — it lands as an unstyled item on a new line.
     *      -> MutationObserver on the wrapper re-tags and updates.
     *   3. Editor lifecycle events. section:load / :unload fire without the
     *      element being re-created in every case. -> explicit handlers.
     *
     * Everything registers against one AbortController so a disconnect (the
     * editor moves nodes as well as replacing them) cannot leak or double-bind.
     */
    connectedCallback() {
      this.swiper = null;
      this.mql = window.matchMedia('(min-width: 768px)');

      this.wrapper = this.querySelector('.swiper-wrapper');
      if (!this.wrapper) return;
      this.swiperEl = this.querySelector('.swiper');

      this.controller = new AbortController();
      var signal = this.controller.signal;
      var self = this;

      this.mql.addEventListener('change', function () { self.refresh(); }, { signal: signal });

      document.addEventListener('shopify:block:select', function (e) {
        if (!self.contains(e.target)) return;
        // The re-rendered block may not be measured yet — sync first, then
        // reveal the selected slide so the editor scrolls to real geometry.
        self.sync();
        var slide = e.target.closest('.swiper-slide');
        if (slide && self.swiper) {
          var index = Array.from(self.wrapper.children).indexOf(slide);
          if (index >= 0) self.swiper.slideTo(index);
        }
      }, { signal: signal });

      document.addEventListener('shopify:block:deselect', function (e) {
        if (self.contains(e.target)) self.scheduleSync();
      }, { signal: signal });

      document.addEventListener('shopify:section:load', function (e) {
        if (e.target.contains(self)) self.refresh();
      }, { signal: signal });

      document.addEventListener('shopify:section:unload', function (e) {
        if (e.target.contains(self)) self.teardown();
      }, { signal: signal });

      document.addEventListener('shopify:section:select', function (e) {
        if (e.target.contains(self)) self.scheduleSync();
      }, { signal: signal });

      // Width changes the window never reports: a section re-rendered into an
      // unlaid-out subtree, a hidden tab panel becoming visible, the editor's
      // device-preview switch.
      if (window.ResizeObserver) {
        this.lastWidth = 0;
        this.ro = new ResizeObserver(function (entries) {
          var width = Math.round(entries[0].contentRect.width);
          if (width === self.lastWidth) return;
          var wasZero = self.lastWidth === 0;
          self.lastWidth = width;
          if (!width) return;
          // 0 -> real width means the first measurement was worthless: rebuild
          // rather than update, so slidesPerView is recomputed from scratch.
          if (wasZero && self.swiper) self.refresh();
          else self.scheduleSync();
        });
        this.ro.observe(this.swiperEl || this);
      }

      // Children replaced by the editor without a full section re-render.
      this.mo = new MutationObserver(function () { self.scheduleSync(); });
      this.observeChildren();

      this.initWhenReady();
    }

    observeChildren() {
      if (this.mo && this.wrapper) this.mo.observe(this.wrapper, { childList: true });
    }

    /**
     * Coalesce every "something moved" signal into one sync on the next frame.
     * The MutationObserver is detached across the work because sync() re-tags
     * slides and Swiper's own loop mode adds/removes duplicate slides — both
     * are childList mutations that would otherwise re-trigger us forever.
     */
    scheduleSync() {
      if (this.syncQueued) return;
      this.syncQueued = true;
      var self = this;
      requestAnimationFrame(function () {
        self.syncQueued = false;
        if (!self.isConnected || !self.wrapper) return;
        if (self.mo) self.mo.disconnect();
        try {
          self.sync();
        } finally {
          self.observeChildren();
        }
      });
    }

    // Bubbling announcement so a nav block rendered as a SIBLING of this
    // carousel can find the instance without reaching into it. Nothing may
    // cache the reference — refresh() destroys and rebuilds across 768px.
    announce(name) {
      this.dispatchEvent(
        new CustomEvent(name, { bubbles: true, detail: { swiper: this.swiper } })
      );
    }

    /**
     * Teardown that leaves NOTHING behind for a static layout to fight with.
     *
     * A Flexible Layout may be a carousel on one breakpoint and Stack / Double
     * Stack / Flexible Rows on the other. Crossing 768px therefore destroys the
     * instance — and Swiper's inline styles (translate3d on .swiper-wrapper,
     * per-slide width + margin-right) outrank every stylesheet rule, so leaving
     * them behind pins the static breakpoint to a shifted, fixed-width row.
     * destroy(deleteInstance, cleanStyles=true) handles most of it; the manual
     * scrub covers the wrapper/slide properties Swiper does not always reset
     * (it only clears what it believes it wrote).
     */
    teardown() {
      if (!this.swiper) return;
      this.swiper.destroy(true, true);
      this.swiper = null;
      this.scrubSwiperStyles();
      this.announce('carousel:destroy');
    }

    scrubSwiperStyles() {
      if (!this.wrapper) return;
      ['transform', 'transition-duration', 'transition-delay', 'height'].forEach(
        function (prop) { this.wrapper.style.removeProperty(prop); }.bind(this)
      );
      this.wrapper.querySelectorAll(':scope > *').forEach(function (el) {
        ['width', 'height', 'margin-right', 'margin-left', 'margin-top', 'margin-bottom'].forEach(
          function (prop) { el.style.removeProperty(prop); }
        );
      });
      var swiperEl = this.querySelector('.swiper');
      if (swiperEl) {
        swiperEl.classList.remove('is-locked');
        swiperEl.style.removeProperty('height');
      }
    }

    disconnectedCallback() {
      this.teardown();
      if (this.controller) {
        this.controller.abort();
        this.controller = null;
      }
      if (this.ro) {
        this.ro.disconnect();
        this.ro = null;
      }
      if (this.mo) {
        this.mo.disconnect();
        this.mo = null;
      }
    }

    activeLayout() {
      var isDesktop = this.mql.matches;
      return isDesktop ? this.dataset.layoutDesktop : this.dataset.layoutMobile;
    }

    isCarouselActive() {
      var layout = this.activeLayout();
      return layout === 'carousel' || layout === 'row_carousel';
    }

    parseSpv(value) {
      return value === 'auto' ? 'auto' : (parseFloat(value) || 1);
    }

    // Swiper loads once per page; the carousel builds once it is within a screen
    // of view (Motion.whenSwiper, assets/motion-reveal.js).
    initWhenReady() {
      if (this.inRange) {
        this.sync();
        return;
      }
      if (this.waiting) return;
      this.waiting = true;
      var self = this;
      window.Motion.whenSwiper(this, function () {
        self.waiting = false;
        self.inRange = true;
        if (self.isConnected) self.sync();
      });
    }

    refresh() {
      this.teardown();
      this.sync();
    }

    updateSlideClasses() {
      var active = this.isCarouselActive();
      // Blocks rendered with "tag": null (e.g. card)
      // emit their scoped {% style %} tag as a direct child of .swiper-wrapper
      // alongside the actual .swiper-slide div. Skip non-rendered nodes so we
      // never tag a {% style %}/<script>/<link>/<template> as a slide — Swiper's
      // CSS forces `.swiper-slide { display: block }`, which would otherwise
      // reveal the raw CSS source as a visible slide.
      // OVERLAY-CAROUSEL / OVERLAY-DRAWER: these child blocks render here before
      // relocating themselves to <body>; they must never be tagged as a slide.
      var SKIP = { STYLE: 1, SCRIPT: 1, LINK: 1, TEMPLATE: 1, 'OVERLAY-CAROUSEL': 1, 'OVERLAY-DRAWER': 1 };
      this.wrapper.querySelectorAll(':scope > *').forEach(function (el) {
        if (SKIP[el.tagName]) return;
        el.classList.toggle('swiper-slide', active);
      });
    }

    sync() {
      // Until the carousel is in range nothing is tagged or measured: tagging
      // slides restyles and re-lays out the whole track, which is wasted work
      // at load for a carousel nobody can see yet.
      if (!this.swiper && !this.inRange) {
        if (this.isCarouselActive()) this.initWhenReady();
        return;
      }
      this.updateSlideClasses();
      // Static breakpoint: the block's own Stack / Double Stack / Rows CSS owns
      // the wrapper from here, so make sure no Swiper residue is left on it.
      if (!this.isCarouselActive()) {
        this.scrubSwiperStyles();
        return;
      }
      if (this.swiper) {
        this.swiper.update();
        return;
      }
      if (!this.inRange) {
        this.initWhenReady();
        return;
      }
      this.createSwiper();
    }

    createSwiper() {
      var d = this.dataset;
      var spvMobile = this.parseSpv(d.spvMobile || '1.5');
      var spvDesktop = this.parseSpv(d.spvDesktop || '4');
      var fallbackGap = parseInt(d.gap, 10) || 0;
      
      // Resolved Design System card/slide gap tokens are the source of truth
      // (already zeroed by Minimal mode) — --ds-item-gap-mobile/-desktop
      // are both always defined regardless of viewport, unlike --carousel-gap
      // which only reflects whichever breakpoint's @media rule is currently
      // active. data-gap (a static px value) is only a fallback for markup
      // that doesn't emit these vars.
      var readGapPx = function (name) {
        var value = getComputedStyle(this).getPropertyValue(name).trim();
        var n = parseFloat(value);
        return isNaN(n) ? null : n;
      }.bind(this);
      // Optional mobile override (data-gap-mobile) — used by the per-block
      // "Remove gaps on mobile" checkbox; falls back to the shared gap.
      var gapMobile = d.gapMobile !== undefined ? parseInt(d.gapMobile, 10) || 0 : readGapPx('--ds-item-gap-mobile');
      if (gapMobile === null) gapMobile = fallbackGap;
      var gap = readGapPx('--ds-item-gap-desktop');
      if (gap === null) gap = fallbackGap;
      var loop = d.loop === 'true';

      // Row (carousel on overflow): watchOverflow locks Swiper into a
      // static-looking row when the slides fit, so looping must stay off
      // (a loop clones slides and always "overflows").
      var isRowCarousel = this.activeLayout() === 'row_carousel';
      if (isRowCarousel) loop = false;

      var swiperEl = this.querySelector('.swiper');
      if (!swiperEl) return;

      var breakpoints = {};
      if (d.spvTablet) {
        breakpoints[768] = { slidesPerView: this.parseSpv(d.spvTablet), spaceBetween: gap };
        breakpoints[1024] = { slidesPerView: spvDesktop, spaceBetween: gap };
      } else {
        breakpoints[768] = { slidesPerView: spvDesktop, spaceBetween: gap };
      }

      this.swiper = new Swiper(swiperEl, {
        slidesPerView: spvMobile,
        spaceBetween: gapMobile,
        loop: loop,
        breakpoints: breakpoints,
        watchOverflow: true,
        // Center slides when there aren't enough to fill the row.
        centerInsufficientSlides: true,
        // Re-measure when slide content (fonts/images) or the DOM changes, so
        // slides initialized before layout settles don't keep a stale height
        // that clips card content once surrounding sections load in.
        observer: true,
        observeParents: true,
        observeSlideChildren: true,
        navigation: {
          nextEl: this.querySelector('.swiper-button-next'),
          prevEl: this.querySelector('.swiper-button-prev')
        },
        pagination: {
          el: this.querySelector('.swiper-pagination'),
          clickable: true
        },
        on: {
          // .is-locked lets CSS align the locked (non-overflowing) row —
          // see the .swiper.is-locked rule in blocks/_container.liquid.
          init: function (s) { s.el.classList.toggle('is-locked', s.isLocked); },
          lock: function (s) { s.el.classList.add('is-locked'); },
          unlock: function (s) { s.el.classList.remove('is-locked'); }
        }
      });

      // Recalculate once late-loading content (web fonts, images below the
      // fold, sections added after) has changed slide dimensions.
      var self = this;
      var reflow = function () { if (self.swiper) self.swiper.update(); };
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(reflow);
      }
      window.addEventListener('load', reflow, { once: true });

      this.announce('carousel:ready');
    }
  }

  customElements.define('container-carousel', ContainerCarousel);
}
