/* Marquee — clones the single `.scrolling-content` group only when it
   overflows its viewport. Short content stays centered and static. */
(function () {
  'use strict';

  function applyLinkTargets(root) {
    root.querySelectorAll('[data-link-new-tab] a').forEach(function (link) {
      var openInNewTab = link.closest('[data-link-new-tab]').getAttribute('data-link-new-tab') === 'true';
      if (openInNewTab) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      } else {
        link.removeAttribute('target');
        link.removeAttribute('rel');
      }
    });
  }

  /** Builds the marquee and returns its size key (see sizeKey) from the widths it
      already read, so callers never measure again after a style write. */
  function build(section) {
    var track = section.querySelector('.scrolling-track');
    var viewport = section.querySelector('.marquee-viewport');
    var content = track && track.querySelector('.scrolling-content:not(.scrolling-content--clone)');
    if (!track || !viewport || !content) return '';

    // Only touch what a previous build left behind: on the first build these
    // writes would be no-ops that still dirty layout before the reads below.
    var clones = track.querySelectorAll('.scrolling-content--clone');
    clones.forEach(function (node) {
      node.remove();
    });
    if (section.classList.contains('scrolling-text--ready')) section.classList.remove('scrolling-text--ready');
    if (track.style.getPropertyValue('--marquee-shift')) track.style.removeProperty('--marquee-shift');
    applyLinkTargets(content);

    var groupWidth = content.scrollWidth;
    var viewportWidth = viewport.clientWidth;
    var key = viewportWidth + ':' + groupWidth;
    if (!content.children.length || groupWidth < 1) return key;

    if (groupWidth < viewportWidth) return key;

    // Extra groups ensure the track always covers the clipped viewport after
    // the first group has translated completely away.
    var copies = Math.min(Math.max(Math.ceil(viewportWidth / groupWidth), 1), 20);
    for (var i = 0; i < copies; i++) {
      var clone = content.cloneNode(true);
      clone.classList.add('scrolling-content--clone');
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('[data-shopify-editor-block]').forEach(function (el) {
        el.removeAttribute('data-shopify-editor-block');
      });

      applyLinkTargets(clone);

      track.appendChild(clone);
    }
    section.classList.add('scrolling-text--ready');
    // The ready state adds the seam gap as padding, so measure the complete
    // animated group after that class is active.
    var readyWidth = content.scrollWidth;
    track.style.setProperty('--marquee-shift', readyWidth + 'px');
    return viewportWidth + ':' + readyWidth;
  }

  /** Viewport width and the original group's width — everything build() reads. */
  function sizeKey(section) {
    var track = section.querySelector('.scrolling-track');
    var viewport = section.querySelector('.marquee-viewport');
    var content = track && track.querySelector('.scrolling-content:not(.scrolling-content--clone)');
    return viewport && content ? viewport.clientWidth + ':' + content.scrollWidth : '';
  }

  function init(section) {
    section.__marqueeSize = build(section);
  }

  // Rebuilding removes the clones and restarts the scroll animation, so the
  // resize / load signals rebuild only when a measured width actually changed.
  function refresh(section) {
    if (section.__marqueeSize && sizeKey(section) === section.__marqueeSize) return;
    init(section);
  }

  // The first build runs from the observer's initial report, which arrives
  // right after layout, so its reads are free. Building synchronously at
  // DOMContentLoaded forced a layout of the still-settling page per marquee.
  function observe(section) {
    var viewport = section.querySelector('.marquee-viewport');
    if (!window.ResizeObserver || !viewport) {
      init(section);
      return;
    }
    if (section.__marqueeResizeObserver) {
      init(section);
      return;
    }
    section.__marqueeResizeObserver = new ResizeObserver(function () {
      refresh(section);
    });
    section.__marqueeResizeObserver.observe(viewport);
  }

  function initAll() {
    document.querySelectorAll('.marquee-section').forEach(observe);
  }

  function refreshAll() {
    document.querySelectorAll('.marquee-section').forEach(function (section) {
      if (section.__marqueeSize === undefined) observe(section);
      else refresh(section);
    });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refreshAll, 200);
  });

  // A section can now nest more than one `.marquee-section` scope (e.g. Hero
  // Marquee's repeatable Marquee Group block), so both handlers walk every
  // match instead of stopping at the first.
  function findMarqueeSections(target) {
    if (target.matches && target.matches('.marquee-section')) return [target];
    return target.querySelectorAll ? Array.prototype.slice.call(target.querySelectorAll('.marquee-section')) : [];
  }

  document.addEventListener('shopify:section:load', function (event) {
    findMarqueeSections(event.target).forEach(observe);
  });

  document.addEventListener('shopify:section:unload', function (event) {
    findMarqueeSections(event.target).forEach(function (section) {
      if (section.__marqueeResizeObserver) {
        section.__marqueeResizeObserver.disconnect();
        delete section.__marqueeResizeObserver;
      }
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
  window.addEventListener('load', refreshAll);
})();
