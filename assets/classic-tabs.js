/* ==========================================================================
 * <classic-tabs> — controller for the classic sections (`cls-`): Featured
 * Products, Featured Collection, Classic Collection Tabs, Featured Articles
 * and Featured Blogs. Opens one panel at a time from the tab row (real
 * tablist ARIA, roving tabindex, Arrow / Home / End) and drives the desktop
 * previous / next arrows of a carousel panel.
 *
 * The carousel itself is native: CSS scroll-snap on .cls-viewport (see
 * snippets/classic-panel.liquid). The arrows scroll it by one card and are
 * disabled at either end, hidden when nothing overflows.
 *
 * Theme editor: the section is re-rendered as new nodes, so connected /
 * disconnected callbacks own the lifecycle; every listener hangs off one
 * AbortController. shopify:block:select on a tab button opens its panel.
 * ========================================================================== */
(function () {
  'use strict';

  if (customElements.get('classic-tabs')) return;

  class ClassicTabs extends HTMLElement {
    connectedCallback() {
      this.controller = new AbortController();
      var signal = this.controller.signal;

      this.tablist = this.querySelector('[data-cls-tablist]');
      this.tabs = Array.prototype.slice.call(this.querySelectorAll('[data-cls-tab]'));
      this.panels = Array.prototype.slice.call(this.querySelectorAll('[data-cls-panel]'));
      this.frame = 0;

      var start = 0;
      this.panels.forEach(function (panel, i) {
        if (panel.classList.contains('is-active')) start = i;
      });
      this.index = start;

      this.setupTabs(signal);
      this.select(start, false);

      this.addEventListener(
        'click',
        function (event) {
          var arrow = event.target.closest('[data-cls-prev], [data-cls-next]');
          if (!arrow) return;
          this.step(arrow.closest('[data-cls-panel]'), arrow.hasAttribute('data-cls-prev') ? -1 : 1);
        }.bind(this),
        { signal: signal }
      );

      // Scroll does not bubble, so listen in the capture phase.
      this.addEventListener('scroll', this.queueArrows.bind(this), { signal: signal, capture: true, passive: true });

      if (window.ResizeObserver) {
        this.ro = new ResizeObserver(this.queueArrows.bind(this));
        this.ro.observe(this);
      }

      document.addEventListener(
        'shopify:block:select',
        function (event) {
          var i = this.tabs.indexOf(event.target);
          if (i > -1) this.select(i, false);
        }.bind(this),
        { signal: signal }
      );
    }

    disconnectedCallback() {
      if (this.ro) this.ro.disconnect();
      if (this.controller) this.controller.abort();
      cancelAnimationFrame(this.frame);
      this.ro = null;
      this.controller = null;
    }

    /* ------------------------------------------------------------------ tabs */

    setupTabs(signal) {
      if (!this.tablist || !this.tabs.length) return;
      this.tablist.setAttribute('role', 'tablist');

      this.tabs.forEach(
        function (tab, i) {
          var panel = this.panels[i];
          tab.setAttribute('role', 'tab');
          if (panel) {
            tab.setAttribute('aria-controls', panel.id);
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', tab.id);
            panel.setAttribute('tabindex', '0');
          }
        }.bind(this)
      );

      this.tablist.addEventListener(
        'click',
        function (event) {
          var tab = event.target.closest('[data-cls-tab]');
          var i = this.tabs.indexOf(tab);
          if (i > -1 && i !== this.index) this.select(i, true);
        }.bind(this),
        { signal: signal }
      );

      this.tablist.addEventListener(
        'keydown',
        function (event) {
          var i = this.tabs.indexOf(event.target);
          if (i < 0) return;
          var last = this.tabs.length - 1;
          var next = null;
          switch (event.key) {
            case 'ArrowRight':
              next = i === last ? 0 : i + 1;
              break;
            case 'ArrowLeft':
              next = i === 0 ? last : i - 1;
              break;
            case 'Home':
              next = 0;
              break;
            case 'End':
              next = last;
              break;
            default:
              return;
          }
          event.preventDefault();
          this.select(next, true);
          this.tabs[next].focus();
        }.bind(this),
        { signal: signal }
      );
    }

    select(index, animate) {
      if (!this.panels[index]) index = 0;
      var changed = index !== this.index;
      this.index = index;

      this.tabs.forEach(function (tab, i) {
        var on = i === index;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('tabindex', on ? '0' : '-1');
      });

      this.panels.forEach(function (panel, i) {
        var on = i === index;
        panel.classList.toggle('is-active', on);
        panel.classList.toggle('is-switched', on && animate && changed);
      });

      // Keep the open tab in view when the row scrolls sideways on a phone.
      var tab = this.tabs[index];
      if (tab && this.tablist && this.tablist.scrollWidth > this.tablist.clientWidth) {
        this.tablist.scrollTo({
          left: tab.offsetLeft - (this.tablist.clientWidth - tab.offsetWidth) / 2,
          behavior: animate ? 'smooth' : 'auto'
        });
      }

      this.updateArrows();
    }

    /* ---------------------------------------------------------------- arrows */

    step(panel, direction) {
      var viewport = panel && panel.querySelector('[data-cls-viewport]');
      var slide = viewport && viewport.querySelector('.cls-slide');
      if (!slide) return;
      var gap = parseFloat(getComputedStyle(slide.parentElement).columnGap) || 0;
      var rtl = getComputedStyle(viewport).direction === 'rtl' ? -1 : 1;
      viewport.scrollBy({ left: direction * rtl * (slide.offsetWidth + gap), behavior: 'smooth' });
    }

    queueArrows() {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(this.updateArrows.bind(this));
    }

    updateArrows() {
      this.panels.forEach(function (panel) {
        var box = panel.querySelector('[data-cls-arrows]');
        var viewport = panel.querySelector('[data-cls-viewport]');
        if (!box || !viewport) return;
        var max = viewport.scrollWidth - viewport.clientWidth;
        box.hidden = max <= 1;
        if (box.hidden) return;
        var pos = Math.abs(viewport.scrollLeft);
        var prev = box.querySelector('[data-cls-prev]');
        var next = box.querySelector('[data-cls-next]');
        if (prev) prev.disabled = pos <= 1;
        if (next) next.disabled = pos >= max - 1;
      });
    }
  }

  customElements.define('classic-tabs', ClassicTabs);
})();
