/* ==========================================================================
 * LOAD STATE — presentation for busy / offline / error (shared)
 *
 * Wraps one snippets/ldx-state.liquid element and owns nothing else: it does
 * not fetch, does not know what is being loaded, and never touches the track.
 * Consumers call busy() before their request and offline()/error()/clear()
 * after it, handing in the function that repeats the attempt.
 *
 * TWO WAYS BACK FROM A FAILURE
 * ----------------------------
 *  1. The Retry button repeats the exact failed attempt.
 *  2. A one-shot `online` listener repeats it automatically the moment the
 *     browser regains connectivity, then removes itself.
 *
 * There is deliberately no backoff timer. A connection that is genuinely down
 * should sit visibly failed — a spinner that never resolves reads as broken,
 * and silent retries hide from the user that anything is wrong.
 * ========================================================================== */

(function () {
  var NS = (window.Loader = window.Loader || {});
  if (NS.State) return;

  class State {
    /** @param {HTMLElement} root a [data-ldx-state] element */
    constructor(root) {
      this.root = root;
      this.msg = root.querySelector('[data-ldx-msg]');
      this.retryBtn = root.querySelector('[data-ldx-retry]');
      this.strings = {
        offlineTitle: root.dataset.offlineTitle || 'Internet Connection Error',
        offlineMsg: root.dataset.offlineMsg || 'Check your connection and try again.',
        errorMsg: root.dataset.errorMsg || 'Something went wrong. Please try again.',
        busyMsg: root.dataset.busyMsg || '',
      };

      this.retryFn = null;
      this.onlineHandler = null;

      if (this.retryBtn) {
        this.retryBtn.addEventListener('click', this.handleRetry.bind(this));
      }
    }

    /* --------------------------------------------------------------- modes */

    /** A request is in flight. */
    busy() {
      this.dropOnlineWatch();
      this.show('busy');
      this.setMessage(this.strings.busyMsg);
      if (this.retryBtn) this.retryBtn.hidden = true;
    }

    /**
     * Present a failure. The kind decides the copy; both kinds get Retry.
     * @param {string} kind      window.Loader.KIND value
     * @param {Function} retryFn repeats the exact failed attempt
     */
    fail(kind, retryFn) {
      this.retryFn = retryFn || null;

      if (kind === (NS.KIND && NS.KIND.OFFLINE)) {
        this.show('offline');
        // The headline is markup, so the message element carries both lines
        // and stays a single live-region update.
        this.msg.innerHTML =
          '<strong></strong><span></span>';
        this.msg.querySelector('strong').textContent = this.strings.offlineTitle;
        this.msg.querySelector('span').textContent = this.strings.offlineMsg;
        this.watchOnline();
      } else {
        this.show('error');
        this.setMessage(this.strings.errorMsg);
      }

      if (this.retryBtn) {
        this.retryBtn.hidden = !this.retryFn;
        this.retryBtn.removeAttribute('aria-busy');
      }
    }

    /** Back to nothing — the region is idle and healthy. */
    clear() {
      this.dropOnlineWatch();
      this.retryFn = null;
      this.root.hidden = true;
      this.root.removeAttribute('data-ldx-mode');
      this.setMessage('');
      if (this.retryBtn) {
        this.retryBtn.hidden = true;
        this.retryBtn.removeAttribute('aria-busy');
      }
    }

    get failed() {
      var mode = this.root.getAttribute('data-ldx-mode');
      return mode === 'offline' || mode === 'error';
    }

    destroy() {
      this.dropOnlineWatch();
    }

    /* ------------------------------------------------------------- retries */

    handleRetry(event) {
      event.preventDefault();
      if (!this.retryFn) return;
      var fn = this.retryFn;
      if (this.retryBtn) this.retryBtn.setAttribute('aria-busy', 'true');
      // busy() clears retryFn's UI; the caller re-registers it if it fails again.
      this.busy();
      fn();
    }

    /**
     * Connectivity came back — take the one free retry and stand down. Only
     * armed for the offline state; an HTTP 500 has nothing to do with the
     * network coming back.
     */
    watchOnline() {
      this.dropOnlineWatch();
      if (!this.retryFn) return;
      this.onlineHandler = function () {
        this.dropOnlineWatch();
        if (!this.failed || !this.retryFn) return;
        var fn = this.retryFn;
        this.busy();
        fn();
      }.bind(this);
      window.addEventListener('online', this.onlineHandler, { once: true });
    }

    dropOnlineWatch() {
      if (!this.onlineHandler) return;
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }

    /* ------------------------------------------------------------------ ui */

    show(mode) {
      this.root.hidden = false;
      this.root.setAttribute('data-ldx-mode', mode);
    }

    setMessage(text) {
      if (!this.msg) return;
      this.msg.textContent = text || '';
    }

    /**
     * Convenience for consumers: find the state element inside a scope and
     * wrap it. Returns null when the consumer did not render one.
     * @param {Element} scope
     */
    static from(scope) {
      var el = scope && scope.querySelector('[data-ldx-state]');
      return el ? new State(el) : null;
    }
  }

  NS.State = State;
})();

/* ==========================================================================
 * LOAD SKELETON — placeholder cards while a batch is in flight (shared)
 *
 * A consumer hands in a <template> holding ONE placeholder slide built like
 * its real card (same slide class, ratio and plate), so each placeholder takes
 * exactly the room of the card it stands for. show(parent, before, n) parks n
 * copies before an anchor; settle(nodes) swaps them for the cards that arrived
 * (already inserted by the consumer); clear() drops them after a failure.
 *
 * ENTRANCE happens IN VIEW. Placeholders and cards wait invisible
 * (.ldx-pending) until an IntersectionObserver sees them, so a batch that
 * lands off-screen still animates when the visitor reaches it. The effect is
 * the template's `data-ldx-effect`:
 *   fade — cross-fade: a card replacing a placeholder the visitor has already
 *          seen fades in while that placeholder fades out on top of it;
 *   rise — fade up: placeholders go, cards rise into place.
 * Items entering together are staggered through --ldx-i. Timings mirror
 * loader-state.css (--ldx-enter-duration / --ldx-enter-stagger).
 * ========================================================================== */

(function () {
  var NS = (window.Loader = window.Loader || {});
  if (NS.Skeleton) return;

  var ENTER_MS = 500;
  var STAGGER_MS = 60;
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function still() {
    return !!(reduced && reduced.matches);
  }

  /** @param {HTMLTemplateElement|null} template one placeholder slide */
  function Skeleton(template) {
    this.template = template || null;
    this.effect = template && template.getAttribute('data-ldx-effect') === 'rise' ? 'rise' : 'fade';
    this.items = [];
    this.io = null;
  }

  Skeleton.prototype.observer = function () {
    if (this.io || !window.IntersectionObserver) return this.io;
    this.io = new IntersectionObserver(
      function (entries) {
        var k = 0;
        entries.forEach(
          function (entry) {
            if (!entry.isIntersecting) return;
            this.io.unobserve(entry.target);
            this.play(entry.target, k++);
          }.bind(this)
        );
      }.bind(this)
    );
    return this.io;
  };

  /** Hold an element out of sight until it scrolls or swipes into view. */
  Skeleton.prototype.enter = function (el) {
    if (!el || still()) return;
    var io = this.observer();
    if (!io) return;
    el.classList.add('ldx-pending');
    io.observe(el);
  };

  Skeleton.prototype.play = function (el, index) {
    el.classList.remove('ldx-pending');
    el.setAttribute('data-ldx-seen', '');
    el.style.setProperty('--ldx-i', index);
    el.classList.add('ldx-enter', 'ldx-enter--' + this.effect);
    setTimeout(function () {
      el.classList.remove('ldx-enter', 'ldx-enter--fade', 'ldx-enter--rise');
      el.style.removeProperty('--ldx-i');
    }, ENTER_MS + index * STAGGER_MS + 100);
  };

  /** Park `count` placeholders in `parent`, before `before` (or at the end). */
  Skeleton.prototype.show = function (parent, before, count) {
    this.clear();
    var source = this.template && this.template.content.firstElementChild;
    if (!source || !parent || !(count > 0)) return this.items;
    for (var i = 0; i < count; i++) {
      var el = source.cloneNode(true);
      el.setAttribute('data-ldx-skeleton', '');
      el.setAttribute('aria-hidden', 'true');
      parent.insertBefore(el, before || null);
      this.items.push(el);
      this.enter(el);
    }
    return this.items;
  };

  /** The batch landed: each card takes over the placeholder at its index. */
  Skeleton.prototype.settle = function (nodes) {
    var placeholders = this.items;
    this.items = [];
    (nodes || []).forEach(
      function (node, i) {
        var ph = placeholders[i];
        if (this.effect === 'fade' && ph && ph.hasAttribute('data-ldx-seen') && !still()) {
          this.cross(node, ph, i);
        } else {
          this.enter(node);
        }
      }.bind(this)
    );
    this.drop(placeholders);
  };

  /** Cross-fade: the placeholder's card lies over the new one and fades out. */
  Skeleton.prototype.cross = function (node, placeholder, index) {
    var ghost = placeholder.firstElementChild;
    if (!ghost) {
      this.enter(node);
      return;
    }
    ghost.classList.add('ldx-ghost');
    node.classList.add('ldx-crossing');
    node.appendChild(ghost);
    this.play(node, index);
    setTimeout(function () {
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      node.classList.remove('ldx-crossing');
    }, ENTER_MS + index * STAGGER_MS + 100);
  };

  Skeleton.prototype.drop = function (list) {
    list.forEach(
      function (el) {
        if (this.io) this.io.unobserve(el);
        if (el.parentNode) el.parentNode.removeChild(el);
      }.bind(this)
    );
  };

  Skeleton.prototype.clear = function () {
    this.drop(this.items);
    this.items = [];
  };

  Skeleton.prototype.destroy = function () {
    this.clear();
    if (this.io) this.io.disconnect();
    this.io = null;
  };

  NS.Skeleton = Skeleton;
})();
