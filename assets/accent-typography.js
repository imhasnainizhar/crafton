/*
 * Accent Typography runtime
 * -------------------------------------------------------------------------
 * Restyles the <strong>/<em> spans inside an accent-enabled scope element as
 * animated decorative accents. CSS accents (highlight / underline / color) are
 * handled entirely by snippets/accent-typography.liquid; this module:
 *   1. drives a single normalised custom property, --accent-progress (0->1);
 *   2. injects & measures the SVG stroke-draw / marker accents;
 *   3. keeps everything in lockstep under the two triggers (in-view / scrub).
 *
 * Contract stamped on the scope element by the block/heading snippet:
 *   [data-accent-scope]
 *   data-accent-bold="{% style %}"    data-accent-italic="{% style %}"
 *   data-accent-trigger="in_view|scrub"   data-accent-threshold="0..1"
 *   --accent-stroke-width, --accent-duration (CSS vars)
 */
(function () {
  'use strict';

  if (window.__accentTypography) return;
  window.__accentTypography = true;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var STROKE_STYLES = ['underline_sketch', 'underline_wavy', 'circle', 'circle_sketch', 'oval', 'oval_sketch'];
  var FILL_STYLES = ['highlight_marker'];
  var SVG_STYLES = STROKE_STYLES.concat(FILL_STYLES);

  function isSvgStyle(s) { return SVG_STYLES.indexOf(s) !== -1; }
  function isStrokeStyle(s) { return STROKE_STYLES.indexOf(s) !== -1; }

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Deterministic PRNG so re-measures (resize / font swap) don't reshuffle the
  // hand-drawn jitter — the sketch stays visually stable.
  function seeded(seed) {
    var s = Math.abs(Math.floor(seed)) % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  /* ---------------------------------------------------------------- GSAP -- */

  /**
   * Inject a script unless another theme script already has. The registry is
   * shared with motion-engine.js and icon-draw.js, so GSAP and ScrollTrigger
   * are fetched and run once per page. async=false keeps GSAP ahead of
   * ScrollTrigger.
   */
  function injectOnce(src) {
    var loads = (window.__themeScriptLoads = window.__themeScriptLoads || {});
    if (loads[src]) return;
    loads[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(undefined); };
      s.onerror = function () { reject(new Error('accent-typography: failed to load ' + src)); };
      document.head.appendChild(s);
    });
    // The poll below is what waits; this only keeps a failure out of the console.
    loads[src].catch(function () {});
  }

  function loadGsap(cb) {
    if (window.gsap && window.ScrollTrigger) { cb(); return; }
    if (!window.__accentGsapLoading) {
      window.__accentGsapLoading = true;
      injectOnce(window.__accentAssets ? window.__accentAssets.gsap : 'gsap.min.js');
      injectOnce(window.__accentAssets ? window.__accentAssets.scrollTrigger : 'ScrollTrigger.min.js');
    }
    var poll = setInterval(function () {
      if (window.gsap && window.ScrollTrigger) {
        clearInterval(poll);
        cb();
      }
    }, 60);
  }

  /* ------------------------------------------------------------ geometry -- */

  function wavyUnderlinePath(x0, baseY, width, rand) {
    var amp = Math.min(2.5, Math.max(0.8, width * 0.012));
    var seg = Math.max(2, Math.round(width / 45));
    var d = 'M ' + x0.toFixed(1) + ' ' + baseY.toFixed(1);
    for (var i = 1; i <= seg; i++) {
      var px = x0 + (width * i) / seg;
      var py = baseY + Math.sin(i * 1.7 + rand() * 6.28) * amp * (0.5 + rand() * 0.5);
      var cx = x0 + (width * (i - 0.5)) / seg;
      var cy = baseY + Math.sin((i - 0.5) * 1.7) * amp;
      d += ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + px.toFixed(1) + ' ' + py.toFixed(1);
    }
    return d;
  }

  // The shared wavy underline is the same three-curve mark used by Accent
  // Text's checkbox. Scale its 120 × 14 viewBox to each marked text line.
  function fixedWavyUnderlinePath(x, y, width, height) {
    var sx = width / 120;
    var sy = height / 14;
    function px(n) { return (x + n * sx).toFixed(1); }
    function py(n) { return (y + n * sy).toFixed(1); }
    return 'M' + px(2) + ' ' + py(9) +
      ' C ' + px(18) + ' ' + py(4) + ', ' + px(31) + ' ' + py(5) + ', ' + px(44) + ' ' + py(8) +
      ' C ' + px(58) + ' ' + py(12) + ', ' + px(72) + ' ' + py(4) + ', ' + px(86) + ' ' + py(6) +
      ' C ' + px(99) + ' ' + py(8) + ', ' + px(108) + ' ' + py(7) + ', ' + px(118) + ' ' + py(5);
  }

  // Catmull-Rom through the sampled points, emitted as cubic beziers. Keeps the
  // outline continuous instead of the faceted polyline a straight L-chain gives.
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    var d = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6;
      var c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6;
      var c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) +
           ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
           ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }

  // Hand-drawn ellipse. The organic feel comes from LOW-frequency deviation —
  // a couple of slow harmonics on the radius plus a small tilt — not from
  // per-point randomness, which reads as a crumpled/torn outline.
  function ellipsePath(cx, cy, rx, ry, wobble, laps, rand) {
    var pts = Math.max(28, Math.round(30 * laps));
    var start = -Math.PI / 2 + (wobble ? (rand() - 0.5) * 0.8 : 0);
    var tilt = wobble ? (rand() - 0.5) * 0.14 : 0;
    var cosT = Math.cos(tilt);
    var sinT = Math.sin(tilt);

    // Two slow lobes (2-3 and 3-5 cycles per lap) read as an unsteady hand.
    var f1 = 2 + Math.round(rand());
    var f2 = 3 + Math.round(rand() * 2);
    var ph1 = rand() * Math.PI * 2;
    var ph2 = rand() * Math.PI * 2;

    // Split the deviation across the axes in proportion to their radii, so a
    // wide oval and a tight circle-around-one-letter distort by the same
    // *fraction* — an absolute px offset warps small shapes into teardrops.
    var base = Math.sqrt(rx * ry) || 1;
    var devX = wobble * (rx / base);
    var devY = wobble * (ry / base);

    var coords = [];
    for (var i = 0; i <= pts; i++) {
      var u = i / pts;
      var t = start + Math.PI * 2 * laps * u;
      // Fade the deviation out at both ends. With laps > 1 the tail passes back
      // over the start, and an un-faded tail crosses it at an angle that reads
      // as a sharp cusp; faded, the two ends lie on the same arc like a real
      // pen overlap.
      var env = Math.max(0, Math.min(1, u / 0.15, (1 - u) / 0.15));
      var n = wobble
        ? (Math.sin(t * f1 + ph1) + Math.sin(t * f2 + ph2) * 0.45) * env
        : 0;
      var ex = (rx + n * devX) * Math.cos(t);
      var ey = (ry + n * devY) * Math.sin(t);
      coords.push([cx + ex * cosT - ey * sinT, cy + ex * sinT + ey * cosT]);
    }
    return smoothPath(coords);
  }

  // Designer hand-drawn circle: a fixed 4-curve loop (open pen stroke, slight
  // overlap at the top) scaled from its own bbox onto the fitted cx/cy/rx/ry —
  // same "fixed template" approach as fixedWavyUnderlinePath, so every
  // circle_sketch accent reproduces this exact stroke instead of an
  // algorithmically wobbled ellipse.
  function fixedCirclePath(cx, cy, rx, ry) {
    var tcx = 61.1135, thx = 60.1135;
    var tcy = 20.5868, thy = 29.8688;
    function px(n) { return (cx + (n - tcx) * (rx / thx)).toFixed(1); }
    function py(n) {
      var d = n - tcy;
      var scale = ry / thy;
      // The template's bottom bulge (below its own center) reads bigger than
      // the top — flatten it 25% so the loop doesn't balloon under the text.
      if (d > 0) scale *= 0.75;
      return (cy + d * scale).toFixed(1);
    }
    return 'M' + px(1) + ' ' + py(14.908) +
      ' C ' + px(89.5233) + ' ' + py(-9.28207) + ', ' + px(115.958) + ' ' + py(5.78783) + ', ' + px(118.323) + ' ' + py(17.637) +
      ' C ' + px(121.227) + ' ' + py(32.1915) + ', ' + px(87.9728) + ' ' + py(46.4447) + ', ' + px(55.184) + ' ' + py(48.4502) +
      ' C ' + px(22.3953) + ' ' + py(50.4556) + ', ' + px(5.53125) + ' ' + py(44.5355) + ', ' + px(4.86451) + ' ' + py(36.0085) +
      ' C ' + px(2.47924) + ' ' + py(26.0962) + ', ' + px(14.4958) + ' ' + py(16.3863) + ', ' + px(48.7547) + ' ' + py(11.7745);
  }

  function markerRectPath(x, y, w, h, rand) {
    var padY = Math.max(2, h * 0.14);
    var top = y - padY * 0.35;
    var bot = y + h + padY * 0.35;
    var seg = Math.max(2, Math.round(w / 40));
    var jitter = Math.max(1, h * 0.05);
    var d = 'M ' + x.toFixed(1) + ' ' + (top + (rand() - 0.5) * jitter).toFixed(1);
    var i;
    for (i = 1; i <= seg; i++) {
      d += ' L ' + (x + (w * i) / seg).toFixed(1) + ' ' + (top + (rand() - 0.5) * jitter).toFixed(1);
    }
    for (i = seg; i >= 0; i--) {
      d += ' L ' + (x + (w * i) / seg).toFixed(1) + ' ' + (bot + (rand() - 0.5) * jitter).toFixed(1);
    }
    return d + ' Z';
  }

  /* -------------------------------------------------------------- overlay -- */

  function localRects(span, scopeRect, borderL, borderT) {
    var out = [];
    var rects = span.getClientRects();
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (r.width < 1 || r.height < 1) continue;
      out.push({
        x: r.left - scopeRect.left - borderL,
        y: r.top - scopeRect.top - borderT,
        w: r.width,
        h: r.height
      });
    }
    return out;
  }

  function makePath(cls, d) {
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    return p;
  }

  // Builds (or rebuilds) the SVG overlay for a scope. Returns true if drawn.
  function buildOverlay(scope, channels) {
    removeOverlay(scope);

    var w = scope.clientWidth;
    var h = scope.clientHeight;
    if (!w || !h) return false; // hidden / not laid out yet — ResizeObserver retries

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'accent-svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    var scopeRect = scope.getBoundingClientRect();
    var borderL = scope.clientLeft;
    var borderT = scope.clientTop;
    var strokes = [];

    channels.forEach(function (ch) {
      if (!isSvgStyle(ch.style)) return;
      var spans = scope.querySelectorAll(ch.tag);
      Array.prototype.forEach.call(spans, function (span) {
        var rects = localRects(span, scopeRect, borderL, borderT);
        if (!rects.length) return;
        var rand = seeded(Math.round(rects[0].w + rects[0].h + span.textContent.length * 7) + 1);

        if (ch.style === 'underline_sketch') {
          rects.forEach(function (r) {
            var baseY = r.y + r.h - Math.max(1, r.h * 0.06);
            var p = makePath('accent-stroke', wavyUnderlinePath(r.x, baseY, r.w, rand));
            svg.appendChild(p);
            strokes.push(p);
          });
        } else if (ch.style === 'underline_wavy') {
          rects.forEach(function (r) {
            var waveHeight = Math.max(7, r.h * 0.42);
            var waveTop = r.y + r.h - waveHeight * 0.35;
            var p = makePath('accent-stroke', fixedWavyUnderlinePath(r.x, waveTop, r.w, waveHeight));
            svg.appendChild(p);
            strokes.push(p);
          });
        } else if (ch.style === 'highlight_marker') {
          rects.forEach(function (r) {
            svg.appendChild(makePath('accent-fill', markerRectPath(r.x, r.y, r.w, r.h, rand)));
          });
        } else {
          // circle / oval (clean or sketch): one ellipse around the union box.
          var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          rects.forEach(function (r) {
            minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
            maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
          });
          var isOval = ch.style.indexOf('oval') === 0;
          var isSketch = ch.style.indexOf('sketch') !== -1;
          var cx = (minX + maxX) / 2;
          var cy = (minY + maxY) / 2;

          // Fit an ellipse that clears the text box, then let the style decide
          // its aspect. 1.35/1.25 puts the curve just outside the corners.
          var rx = ((maxX - minX) / 2) * 1.35 + 6;
          var ry = ((maxY - minY) / 2) * 1.25 + 5;

          if (!isOval) {
            // "Circle" must actually read round. A one-word span's client rect
            // is taller than it is wide, so the fitted ellipse alone would come
            // out as an egg — pull both radii toward the larger one, capped so
            // circling a long phrase doesn't balloon into the rows above/below.
            var r = Math.max(rx, ry);
            rx = Math.min(rx + (r - rx) * 0.6, rx * 2);
            ry = Math.min(ry + (r - ry) * 0.6, ry * 2);
          }
          var strokeW = parseFloat(getComputedStyle(scope).getPropertyValue('--accent-stroke-width')) || 3;
          // Wobble scales with the shape (clamped) so small accents don't get
          // swallowed by the deviation and large ones don't look mechanical.
          var wobble = isSketch
            ? Math.min(6, Math.max(1.5, Math.sqrt(rx * ry) * 0.05 + strokeW * 0.15))
            : 0;
          var d = (isSketch && !isOval)
            ? fixedCirclePath(cx, cy, rx, ry)
            : ellipsePath(cx, cy, rx, ry, wobble, isSketch ? 1.04 : 1, rand);
          var p = makePath('accent-stroke', d);
          svg.appendChild(p);
          strokes.push(p);
        }
      });
    });

    if (!svg.childNodes.length) return false;
    scope.appendChild(svg);

    // Normalise each stroke's dash length so the draw fills exactly on progress 1.
    strokes.forEach(function (p) {
      var len = 0;
      try { len = p.getTotalLength(); } catch (e) { len = 0; }
      if (len) {
        p.style.setProperty('--path-length', len);
        p.style.strokeDasharray = len;
      }
    });

    scope.__accentSvg = svg;
    return true;
  }

  function removeOverlay(scope) {
    if (scope.__accentSvg && scope.__accentSvg.parentNode) {
      scope.__accentSvg.parentNode.removeChild(scope.__accentSvg);
    }
    scope.__accentSvg = null;
  }

  /* --------------------------------------------------------------- setup -- */

  function readChannels(scope) {
    return [
      { tag: 'strong', style: scope.getAttribute('data-accent-bold') || 'none' },
      { tag: 'em', style: scope.getAttribute('data-accent-italic') || 'none' },
      { tag: '[data-accent-target]', style: scope.getAttribute('data-accent-target-style') || 'none' }
    ];
  }

  // Measuring forces layout, so an overlay is built only once its scope is
  // within a screen of view; accents further down cost nothing at load.
  var nearIo = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      nearIo.unobserve(entry.target);
      var run = entry.target.__accentNear;
      entry.target.__accentNear = null;
      if (run) run();
    });
  }, { rootMargin: '100% 0px' }) : null;

  function whenNear(scope, fn) {
    if (!nearIo) { fn(); return; }
    scope.__accentNear = fn;
    nearIo.observe(scope);
  }

  // True when some run in the scope uses an SVG style, i.e. there is something
  // to draw. Querying the DOM forces no layout.
  function hasSvgRuns(scope, channels) {
    return channels.some(function (ch) {
      return isSvgStyle(ch.style) && scope.querySelector(ch.tag);
    });
  }

  // document.fonts.ready brings style up to date when read, so it is read once.
  var fontsReady = null;
  function whenFontsReady() {
    if (!fontsReady) fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return fontsReady;
  }

  function attachOverlay(scope, channels) {
    // Nothing to draw: no measuring, no observer, no font wait.
    if (!hasSvgRuns(scope, channels)) return;
    buildOverlay(scope, channels);
    // Re-measure on size or font changes; preserves the current progress/classes.
    if (!('ResizeObserver' in window)) return;
    var ro = new ResizeObserver(debounce(function () {
      buildOverlay(scope, channels);
      if (scope.__accentST && window.ScrollTrigger) window.ScrollTrigger.refresh();
    }, 120));
    ro.observe(scope);
    scope.__accentRO = ro;
    whenFontsReady().then(function () { if (scope.__accentRO) buildOverlay(scope, channels); });
  }

  function setupScope(scope) {
    if (scope.__accentInited) teardownScope(scope);
    scope.__accentInited = true;

    var channels = readChannels(scope);
    var needsSvg = channels.some(function (c) { return isSvgStyle(c.style); });
    var trigger = scope.getAttribute('data-accent-trigger') || 'in_view';
    var reverse = scope.getAttribute('data-accent-reverse') || 'normal';
    var threshold = parseFloat(scope.getAttribute('data-accent-threshold'));
    if (isNaN(threshold)) threshold = 0.4;

    // Reduced motion: render fully drawn, no observers, no GSAP.
    if (reduceMotion()) {
      scope.style.setProperty('--accent-progress', 1);
      if (needsSvg && hasSvgRuns(scope, channels)) buildOverlay(scope, channels);
      return;
    }

    // Start hidden BEFORE measuring/painting to avoid a flash of the drawn state.
    // 'erase' starts fully drawn (progress 1) and un-draws, so it skips pending.
    if (trigger === 'scrub') {
      scope.style.setProperty('--accent-progress', reverse === 'erase' ? 1 : 0);
    } else if (reverse !== 'erase') {
      scope.classList.add('accent--pending');
    }

    if (needsSvg) whenNear(scope, function () { attachOverlay(scope, channels); });

    if (trigger === 'scrub') {
      loadGsap(function () {
        window.gsap.registerPlugin(window.ScrollTrigger);
        var startPct = Math.round(100 - threshold * 100);
        var endPct = Math.round(threshold * 100);
        scope.__accentST = window.ScrollTrigger.create({
          trigger: scope,
          start: 'top ' + startPct + '%',
          end: 'bottom ' + endPct + '%',
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: function (self) {
            var p = reverse === 'erase' ? 1 - self.progress : self.progress;
            scope.style.setProperty('--accent-progress', p);
          }
        });
      });
    } else {
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          scope.classList.add('accent--animate');
          obs.unobserve(scope);
        });
      }, { rootMargin: '0px 0px -50px 0px', threshold: Math.min(0.99, Math.max(0, threshold)) });
      io.observe(scope);
      scope.__accentIO = io;
    }
  }

  function teardownScope(scope) {
    if (nearIo) nearIo.unobserve(scope);
    scope.__accentNear = null;
    removeOverlay(scope);
    if (scope.__accentRO) { scope.__accentRO.disconnect(); scope.__accentRO = null; }
    if (scope.__accentIO) { scope.__accentIO.disconnect(); scope.__accentIO = null; }
    if (scope.__accentST) { scope.__accentST.kill(); scope.__accentST = null; }
    scope.classList.remove('accent--pending', 'accent--animate');
    scope.style.removeProperty('--accent-progress');
    scope.__accentInited = false;
  }

  /* ---------------------------------------------------------------- init -- */

  function init(root) {
    root = root || document;
    var scopes = root.querySelectorAll('[data-accent-scope]');
    Array.prototype.forEach.call(scopes, setupScope);
  }

  function teardown(root) {
    root = root || document;
    var scopes = root.querySelectorAll('[data-accent-scope]');
    Array.prototype.forEach.call(scopes, teardownScope);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }

  if (window.Shopify && window.Shopify.designMode) {
    document.addEventListener('shopify:section:load', function (e) { init(e.target); });
    document.addEventListener('shopify:section:unload', function (e) { teardown(e.target); });
    document.addEventListener('shopify:block:select', function (e) { init(e.target.parentNode || e.target); });
    document.addEventListener('shopify:section:reorder', function () {
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    });
  }

  window.AccentTypography = { init: init, teardown: teardown };
})();
