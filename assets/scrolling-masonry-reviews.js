/**
 * <smr-masonry> — runtime for blocks/_smr_masonry.liquid.
 *
 * Deals the server-rendered cards from [data-smr-source] into lanes (columns
 * or rows, always into the shortest lane, so columns balance like masonry),
 * appends cloned copies of each lane's group until the viewport is covered,
 * and lets CSS loop every track by exactly one group. Speed is px per second,
 * so lanes of different lengths move at the same pace. Rebuilds when the
 * width or lane count changes; pauses off-screen and while a card is selected
 * in the theme editor. Reduced motion: no clones, no animation.
 */
(function () {
  if (customElements.get('smr-masonry')) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  class SmrMasonry extends HTMLElement {
    connectedCallback() {
      if (this.smrConnected) return;
      this.smrConnected = true;

      this.viewport = this.querySelector('[data-smr-viewport]');
      this.source = this.querySelector('[data-smr-source]');
      if (!this.viewport || !this.source) return;

      // Each card's scoped <style> (and any <script>) renders beside it; those stay in the source.
      this.cards = Array.prototype.filter.call(this.source.children, function (node) {
        return !/^(STYLE|SCRIPT|LINK|TEMPLATE)$/.test(node.tagName);
      });
      this.cards.forEach(function (card) {
        // Review Cards ship .swiper-slide for the carousel; here they are not slides.
        card.classList.remove('swiper-slide');
      });
      this.horizontal = this.dataset.smrOrientation === 'horizontal';
      this.speed = Math.max(parseFloat(this.dataset.smrSpeed) || 40, 1);
      this.sizeKey = '';

      this.onSelect = this.onSelect.bind(this);
      this.onDeselect = this.onDeselect.bind(this);
      document.addEventListener('shopify:block:select', this.onSelect);
      document.addEventListener('shopify:block:deselect', this.onDeselect);

      if ('IntersectionObserver' in window) {
        this.visibility = new IntersectionObserver((entries) => {
          this.classList.toggle('is-offscreen', !entries[entries.length - 1].isIntersecting);
        });
        this.visibility.observe(this);
      }

      if ('ResizeObserver' in window) {
        // The first report arrives right after layout and does the first build.
        this.resize = new ResizeObserver(() => {
          clearTimeout(this.resizeTimer);
          this.resizeTimer = setTimeout(() => this.refresh(), this.sizeKey ? 150 : 0);
        });
        this.resize.observe(this);
      } else {
        this.refresh();
      }
    }

    disconnectedCallback() {
      this.smrConnected = false;
      clearTimeout(this.resizeTimer);
      if (this.resize) this.resize.disconnect();
      if (this.visibility) this.visibility.disconnect();
      document.removeEventListener('shopify:block:select', this.onSelect);
      document.removeEventListener('shopify:block:deselect', this.onDeselect);
    }

    onSelect(event) {
      if (this.contains(event.target)) this.classList.add('is-paused');
    }

    onDeselect(event) {
      if (this.contains(event.target)) this.classList.remove('is-paused');
    }

    laneCount() {
      var lanes = parseInt(getComputedStyle(this).getPropertyValue('--smr-lanes'), 10) || 1;
      return Math.max(1, Math.min(lanes, this.cards.length));
    }

    // Everything a build depends on; resizes that keep it unchanged (a mobile
    // URL bar showing or hiding) never restart the scroll.
    key() {
      return [this.viewport.clientWidth, this.viewport.clientHeight, this.laneCount(), reducedMotion.matches].join(':');
    }

    refresh() {
      if (!this.cards.length) return;
      var key = this.key();
      if (key === this.sizeKey) return;
      this.build();
      this.sizeKey = this.key();
    }

    build() {
      // Put every card back in source order so it is measured at lane width.
      this.classList.remove('is-ready', 'is-built');
      if (this.lanesEl) this.lanesEl.remove();
      this.cards.forEach((card) => this.source.appendChild(card));

      var count = this.laneCount();
      this.style.setProperty('--smr-lanes-count', count);

      var sizes = this.cards.map((card) => {
        var rect = card.getBoundingClientRect();
        return this.horizontal ? rect.width : rect.height;
      });

      var lanesEl = document.createElement('div');
      lanesEl.className = 'smr__lanes';
      var groups = [];
      var totals = [];
      for (var i = 0; i < count; i++) {
        var lane = document.createElement('div');
        lane.className = 'smr__lane';
        var track = document.createElement('div');
        track.className = 'smr__track';
        track.setAttribute('data-smr-track', '');
        var group = document.createElement('div');
        group.className = 'smr__group';
        track.appendChild(group);
        lane.appendChild(track);
        lanesEl.appendChild(lane);
        groups.push(group);
        totals.push(0);
      }

      this.cards.forEach(function (card, index) {
        var shortest = totals.indexOf(Math.min.apply(Math, totals));
        groups[shortest].appendChild(card);
        totals[shortest] += sizes[index];
      });

      this.viewport.appendChild(lanesEl);
      this.lanesEl = lanesEl;
      this.classList.add('is-built');

      if (reducedMotion.matches) return;

      var visible = this.horizontal ? this.viewport.clientWidth : this.viewport.clientHeight;
      groups.forEach((group, index) => {
        var track = group.parentElement;
        var style = getComputedStyle(track);
        var gap = parseFloat(this.horizontal ? style.columnGap : style.rowGap) || 0;
        var rect = group.getBoundingClientRect();
        var shift = (this.horizontal ? rect.width : rect.height) + gap;
        if (shift < 2) return;

        var copies = Math.min(Math.max(Math.ceil(visible / shift), 1), 20);
        for (var c = 0; c < copies; c++) track.appendChild(this.cloneGroup(group));

        var duration = shift / this.speed;
        track.style.setProperty('--smr-shift', shift + 'px');
        track.style.setProperty('--smr-duration', duration.toFixed(2) + 's');
        // Start each lane at a different point of its loop so neighbours never line up.
        track.style.setProperty('--smr-delay', (-duration * ((index * 0.37) % 1)).toFixed(2) + 's');
      });

      this.classList.add('is-ready');
    }

    cloneGroup(group) {
      var clone = group.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('inert', '');
      clone.querySelectorAll('[data-shopify-editor-block], [id]').forEach(function (node) {
        node.removeAttribute('data-shopify-editor-block');
        node.removeAttribute('id');
      });
      return clone;
    }
  }

  customElements.define('smr-masonry', SmrMasonry);
})();
