/* ==========================================================================
 * LOAD SOURCE — Section Rendering API page fetcher (shared)
 *
 * WHY THE `page` PARAM AND NOT A CUSTOM ONE
 * -----------------------------------------
 * Liquid cannot read arbitrary query parameters, so `&fcx_page=2` would be
 * invisible to the section that has to render the batch. The only lever
 * Shopify gives us is the native `page` parameter, which drives a
 * `{% paginate %}` tag. Every consumer therefore wraps its loop in paginate
 * and this file requests:
 *
 *     <current path>?section_id=<id>&page=<n>
 *
 * Each section is its own request, so several paginated sections on one page
 * never collide over the shared `page` parameter. Within one section the
 * shared parameter is an asset: one response carries page N of every
 * paginated region in it, so it is parsed once and kept for the page's
 * lifetime (see `pages` below).
 *
 * WHAT "LOADED COMPLETELY WITH ASSETS" MEANS HERE
 * ----------------------------------------------
 * Parsed markup is not a loaded batch. `awaitAssets()` warms every image the
 * batch references through a detached `Image()` probe, so by the time the
 * caller appends the nodes the bytes are already in the HTTP cache and the
 * cards paint in one frame instead of popping in piecemeal. Failures resolve
 * rather than reject — one dead image must not turn a good batch into an
 * error state — and the whole wait is capped so a hanging asset cannot pin
 * the spinner open forever.
 *
 * This file never touches the DOM of the page and never renders anything.
 * Presenting the outcome is assets/loader-state.js's job.
 * ========================================================================== */

(function () {
  var NS = (window.Loader = window.Loader || {});
  if (NS.fetchItems) return;

  /** How long the asset warm-up may hold the busy state open. */
  var ASSET_TIMEOUT = 8000;

  /** Error kinds the state layer branches on. */
  var KIND = {
    OFFLINE: 'offline', // no connection, or the request never reached the server
    HTTP: 'http', // the server answered with a failure status
    EMPTY: 'empty', // the response parsed but contained nothing we can use
  };

  function loadError(kind, cause) {
    var err = new Error('Loader: ' + kind);
    err.ldxKind = kind;
    if (cause) err.cause = cause;
    return err;
  }

  /**
   * Build the Section Rendering API URL for one page of a region.
   * @param {string} basePath  usually the section's own request path
   * @param {string} sectionId the `section.id` to re-render
   * @param {number} page      1-based page number
   */
  function pageUrl(basePath, sectionId, page) {
    var url = new URL(basePath || window.location.pathname, window.location.origin);
    // Carry the page's own query over (theme preview, filters, sort, locale),
    // so the batch is rendered by the same theme and context as the page —
    // a bare path would ask the live theme, which may not have this section.
    new URLSearchParams(window.location.search).forEach(function (value, key) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    });
    url.searchParams.set('section_id', sectionId);
    url.searchParams.set('page', String(page));
    return url.toString();
  }

  /** Warm one image without inserting it into the document. */
  function warm(img) {
    return new Promise(function (resolve) {
      var probe = new Image();
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve();
      }
      probe.addEventListener('load', finish, { once: true });
      probe.addEventListener('error', finish, { once: true });
      // sizes must be set before srcset for the selection to be correct.
      if (img.getAttribute('sizes')) probe.sizes = img.getAttribute('sizes');
      if (img.getAttribute('srcset')) probe.srcset = img.getAttribute('srcset');
      if (img.getAttribute('src')) probe.src = img.getAttribute('src');
      if (!probe.src && !probe.srcset) return finish();
      if (probe.complete) finish();
    });
  }

  /**
   * Resolves once every image referenced by `nodes` is cached — or once the
   * timeout expires, whichever comes first. Never rejects.
   * @param {Element[]} nodes
   * @returns {Promise<void>}
   */
  function awaitAssets(nodes) {
    var images = [];
    nodes.forEach(function (node) {
      if (node.tagName === 'IMG') images.push(node);
      Array.prototype.push.apply(images, Array.prototype.slice.call(node.querySelectorAll('img')));
    });
    if (!images.length) return Promise.resolve();

    var settled = Promise.all(images.map(warm));
    var capped = new Promise(function (resolve) {
      setTimeout(resolve, ASSET_TIMEOUT);
    });
    return Promise.race([settled, capped]).then(function () {});
  }

  /**
   * Parsed responses, one per URL. Every leaf paginates by the same `page`
   * parameter, so `?section_id=S&page=2` already holds page 2 of EVERY tab,
   * category and stage in the section: a second panel asking for the same
   * page reads this document instead of re-rendering the section. Failures
   * are dropped so a retry always goes to the network, and the editor
   * clears everything when it re-renders a section.
   */
  var pages = new Map();

  function clearPages() {
    pages.clear();
  }
  // Capture phase: runs before any controller's own (bubble-phase) handler,
  // so a host rebuilding — and preloading — on this event never reads a page
  // rendered with the settings it is being rebuilt to replace.
  document.addEventListener('shopify:section:load', clearPages, true);
  document.addEventListener('shopify:section:unload', clearPages, true);

  /** @returns {Promise<Document>} */
  function loadPage(url, signal) {
    var cached = pages.get(url);
    if (cached) return cached;

    // Cheapest possible offline check — saves a doomed request entirely.
    if (navigator.onLine === false) {
      return Promise.reject(loadError(KIND.OFFLINE));
    }

    var request = fetch(url, { signal: signal, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .catch(function (error) {
        // AbortError is a caller decision, not a failure to report.
        if (error && error.name === 'AbortError') throw error;
        // A rejected fetch means the request never completed — DNS, dropped
        // connection, airplane mode. Always a connectivity story.
        throw loadError(KIND.OFFLINE, error);
      })
      .then(function (response) {
        if (!response.ok) throw loadError(KIND.HTTP);
        return response.text();
      })
      .then(function (html) {
        return new DOMParser().parseFromString(html, 'text/html');
      });

    pages.set(url, request);
    request.catch(function () {
      if (pages.get(url) === request) pages.delete(url);
    });
    return request;
  }

  /**
   * Fetch one page of a section and return its matching nodes, cloned into
   * the live document and with their assets already warmed.
   *
   * @param {Object} opts
   * @param {string} opts.basePath   path to re-render (default: current path)
   * @param {string} opts.sectionId  section.id
   * @param {number} opts.page       1-based page number
   * @param {string} opts.selector   what counts as an item in the response
   * @param {AbortSignal} [opts.signal]
   * @param {boolean} [opts.skipAssets] resolve before warming (background preload)
   * @returns {Promise<Element[]>}
   */
  function fetchItems(opts) {
    var url = pageUrl(opts.basePath, opts.sectionId, opts.page);

    return loadPage(url, opts.signal)
      .then(function (doc) {
        var found = Array.prototype.slice.call(doc.querySelectorAll(opts.selector));
        if (!found.length) throw loadError(KIND.EMPTY);

        // importNode clones, which keeps the cached document whole for the
        // next panel that reads this page.
        var nodes = found.map(function (node) {
          return document.importNode(node, true);
        });

        if (opts.skipAssets) return nodes;
        return awaitAssets(nodes).then(function () {
          return nodes;
        });
      });
  }

  NS.KIND = KIND;
  NS.pageUrl = pageUrl;
  NS.awaitAssets = awaitAssets;
  NS.fetchItems = fetchItems;
})();
