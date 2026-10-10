// @ts-check
/**
 * Motion reveal (assets/motion-reveal.js). Switches on the class-based entrances
 * printed by snippets/motion-reveal.liquid. Elements start visible. One shared
 * IntersectionObserver marks those below the fold .is-offscreen and swaps that for
 * .is-inview as they enter, and assets/motion.css animates. It reads no settings.
 * Loaded once from layout/theme.liquid. Also owns the page's lazy loaders
 * (Motion.loadGsap, Motion.loadSwiper / whenSwiper); the engine
 * (motion-engine.js) extends Motion.refresh.
 */
(function () {
  'use strict';

  if (window.__motionReveal) return;
  window.__motionReveal = true;

  const html = document.documentElement;
  const Motion = (window.Motion = window.Motion || {});
  const off = window.__motionDisabled === true || html.classList.contains('motion-disabled') ||
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  const observed = new WeakSet();
  const items = (el) => [...el.children].filter((c) => !c.matches('style, script, link, template, [data-motion], .motion-reveal--skip'));
  const num = (el, name) => Number(el.getAttribute(name)) || 0;

  // Group orders CSS can't express: items sharing a key start together, in key order.
  // rows / cols measure where items landed; the rest read Editor grid coordinates.
  const ORDER = {
    rows: (el) => Math.round(el.getBoundingClientRect().top),
    cols: (el) => Math.round(el.getBoundingClientRect().left),
    top: (el) => num(el, 'data-motion-row'),
    bottom: (el) => -num(el, 'data-motion-row'),
    left: (el) => num(el, 'data-motion-col'),
    right: (el) => -num(el, 'data-motion-col'),
    diagonal: (el) => num(el, 'data-motion-row') + num(el, 'data-motion-col'),
  };
  const orderOf = (el) => Object.keys(ORDER).find((k) => el.classList.contains('motion-reveal--' + k));

  const io = new IntersectionObserver((entries) => {
    // Read pass first (rows / cols read layout), then every write.
    const slots = entries
      .filter((e) => e.isIntersecting && e.target.classList.contains('is-offscreen') && orderOf(e.target))
      .map((e) => {
        const kids = items(e.target);
        const keys = kids.map(ORDER[orderOf(e.target)]);
        const ranks = [...new Set(keys)].sort((a, b) => a - b);
        return () => kids.forEach((k, i) => k.style.setProperty('--motion-reveal-i', String(ranks.indexOf(keys[i]))));
      });
    slots.forEach((write) => write());

    entries.forEach(({ target: el, isIntersecting }) => {
      const replay = el.classList.contains('motion-reveal--replay');
      if (isIntersecting) {
        if (el.classList.contains('is-offscreen')) el.classList.replace('is-offscreen', 'is-inview');
        if (!replay) io.unobserve(el);
      } else if (replay || !el.classList.contains('is-inview')) {
        el.classList.remove('is-inview');
        el.classList.add('is-offscreen');
      }
    });
  }, { rootMargin: '0px 0px -10% 0px' });

  /** Observe every reveal element in a subtree (new DOM, section reloads). Idempotent. */
  function scan(root) {
    if (off) return;
    const scope = root || document;
    const els = [...scope.querySelectorAll('.motion-reveal')];
    if (scope instanceof Element && scope.matches('.motion-reveal')) els.push(scope);
    els.forEach((el) => {
      if (observed.has(el) || el.classList.contains('motion-reveal--hover')) return;
      observed.add(el);
      io.observe(el);
    });
  }

  Motion.refresh = scan;

  // One lazy loader, shared by motion-engine.js, accent-typography.js, icon-draw.js
  // and sections that run their own GSAP, so each file loads once per page.
  const loads = (window.__themeScriptLoads = window.__themeScriptLoads || {});
  Motion.loadScript = (src) => loads[src] || (loads[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // run in request order: gsap before ScrollTrigger before add-ons
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  }));
  Motion.loadGsap = () => {
    const assets = window.__motionAssets || {};
    return Promise.all([
      window.gsap || Motion.loadScript(assets.gsap),
      window.ScrollTrigger || Motion.loadScript(assets.scrollTrigger),
    ]);
  };

  // Measuring without forcing layout. An IntersectionObserver entry carries the
  // element's box, computed during the browser's own rendering step, so
  // Motion.measure(el, cb) hands cb(rect, viewportWidth) with no forced layout.
  // The page width comes the same way: <html> is observed alongside, and its
  // box is the viewport minus any scrollbar (what clientWidth would report).
  const measures = new Map();
  let pageWidth = 0;
  const measureIo = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target === html) {
        pageWidth = entry.boundingClientRect.width;
        measureIo.unobserve(html);
      }
    });
    entries.forEach(({ target, boundingClientRect }) => {
      if (!measureIo || target === html) return;
      measureIo.unobserve(target);
      const callbacks = measures.get(target) || [];
      measures.delete(target);
      callbacks.forEach((cb) => cb(boundingClientRect, Math.round(pageWidth)));
    });
  });
  Motion.measure = (/** @type {Element} */ el, /** @type {(r: DOMRectReadOnly, vw: number) => void} */ cb) => {
    if (!measureIo) {
      cb(el.getBoundingClientRect(), html.clientWidth);
      return;
    }
    const callbacks = measures.get(el);
    if (callbacks) {
      callbacks.push(cb);
      return;
    }
    measures.set(el, [cb]);
    measureIo.observe(html); // re-observing delivers a fresh page box in the same callback
    measureIo.observe(el);
  };

  // Swiper JS loads once per page, on demand (its CSS is in the head, so slides
  // never reflow). whenSwiper(el, cb) runs cb once el is within a screen of view
  // and Swiper is ready, so carousels further down cost nothing at load.
  // Before the visitor's first scroll, tap or key press only carousels that are
  // actually on screen build; ones just below the fold wait for that first input
  // (they are off screen, so building them later shifts nothing anyone sees).
  Motion.loadSwiper = () => window.Swiper
    ? Promise.resolve(window.Swiper)
    : Motion.loadScript((window.__motionAssets || {}).swiper).then(() => window.Swiper);
  const pending = new WeakMap();
  const INPUT_EVENTS = ['scroll', 'wheel', 'pointerdown', 'touchstart', 'keydown'];
  const afterInput = new Set();
  let interacted = !!(window.Shopify && window.Shopify.designMode);
  const release = () => {
    if (interacted) return;
    interacted = true;
    INPUT_EVENTS.forEach((type) => removeEventListener(type, release, true));
    afterInput.forEach((run) => run());
    afterInput.clear();
  };
  if (!interacted) INPUT_EVENTS.forEach((type) => addEventListener(type, release, { capture: true, passive: true }));
  const build = (target) => {
    const callbacks = pending.get(target) || [];
    pending.delete(target);
    // One task per build, so carousels arriving together never form one long task.
    Motion.loadSwiper().then(() => callbacks.forEach((cb) => setTimeout(cb)));
  };
  const nearIo = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting, boundingClientRect: r, rootBounds: rb }) => {
      if (!isIntersecting || !nearIo) return;
      nearIo.unobserve(target);
      // The root is the viewport grown by one viewport above and below, so the
      // viewport is its middle third. (Reading innerHeight here would force layout.)
      const vh = rb ? rb.height / 3 : 0;
      const onScreen = !rb || (r.top < rb.top + 2 * vh && r.bottom > rb.top + vh);
      if (interacted || onScreen) build(target);
      else afterInput.add(() => build(target));
    });
  }, { rootMargin: '100% 0px' });
  Motion.whenSwiper = (/** @type {Element} */ el, /** @type {() => void} */ cb) => {
    if (!nearIo || !el) {
      Motion.loadSwiper().then(() => setTimeout(cb));
      return;
    }
    const callbacks = pending.get(el);
    if (callbacks) {
      callbacks.push(cb);
      return;
    }
    pending.set(el, [cb]);
    nearIo.observe(el);
  };

  // A finished play-once entrance drops .is-inview, so a later DOM move (tab
  // hoisting, Swiper loop) never restarts its keyframes.
  document.addEventListener('animationend', (e) => {
    const playing = (/** @type {any} */ a) => String(a.animationName || '').startsWith('motion-reveal');
    if (!playing(e)) return;
    const target = /** @type {Element} */ (e.target);
    const host = target.classList.contains('is-inview') ? target : target.parentElement;
    if (!host || !host.classList.contains('is-inview') || host.classList.contains('motion-reveal--replay')) return;
    if (!host.getAnimations({ subtree: true }).some(playing)) host.classList.remove('is-inview');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan());
  else scan();
  window.addEventListener('load', () => scan(), { once: true });

  if (window.Shopify && window.Shopify.designMode) {
    document.addEventListener('shopify:section:load', (e) => scan(/** @type {Element} */ (e.target)));
    // A selected block shows its final state, so editing is never hidden.
    document.addEventListener('shopify:block:select', (e) => {
      const block = /** @type {Element} */ (e.target);
      [block, ...block.querySelectorAll('.is-offscreen')].forEach((el) => el.classList.remove('is-offscreen'));
    });
  }
})();
