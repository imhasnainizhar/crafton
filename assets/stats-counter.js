/* <stats-counter> — observer-gated count-up for Number blocks and marked
   Heading content. Animates every [data-stat-value] descendant
   once when its counter scrolls into view: "92%" counts 0 → 92 keeping the
   "%", "1,200+" keeps its grouping and suffix. Non-numeric values are left
   untouched, as is everything when data-animate is off or the visitor
   prefers reduced motion. Observer thresholds match statistics-column.js.
   No shopify:section:load listener is needed — as a custom element,
   connectedCallback re-runs when the editor re-renders the section. */
if (!customElements.get('stats-counter')) {
  class StatsCounter extends HTMLElement {
    connectedCallback() {
      if (this.dataset.animate !== 'true') return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (!('IntersectionObserver' in window)) return;

      const stats = [];
      this.querySelectorAll('[data-stat-value]').forEach((el) => {
        if (el.closest('stats-counter') !== this) return;
        const match = el.textContent.trim().match(/^([^0-9]*)([0-9][0-9.,]*)(.*)$/);
        if (!match) return;
        const value = parseFloat(match[2].replace(/,/g, ''));
        if (isNaN(value)) return;
        stats.push({
          el: el,
          prefix: match[1],
          suffix: match[3],
          value: value,
          decimals: (match[2].split('.')[1] || '').length,
          grouped: match[2].indexOf(',') !== -1,
          finalText: el.textContent,
        });
      });
      if (!stats.length) return;

      // Zero the values until the grid scrolls into view.
      stats.forEach((s) => {
        s.el.textContent = s.prefix + this.format(0, s) + s.suffix;
      });

      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            this.observer.disconnect();
            this.animateStats(stats);
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
      );
      this.observer.observe(this);
    }

    disconnectedCallback() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    }

    animateStats(stats) {
      const duration = 2000;
      const start = performance.now();
      const tick = (now) => {
        if (!this.isConnected) return;
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        stats.forEach((s) => {
          s.el.textContent = t < 1 ? s.prefix + this.format(s.value * eased, s) + s.suffix : s.finalText;
        });
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    format(value, stat) {
      if (stat.grouped) {
        return value.toLocaleString('en-US', {
          minimumFractionDigits: stat.decimals,
          maximumFractionDigits: stat.decimals,
        });
      }
      return value.toFixed(stat.decimals);
    }
  }
  customElements.define('stats-counter', StatsCounter);
}
