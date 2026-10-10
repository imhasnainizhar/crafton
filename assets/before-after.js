/* <before-after-slider> — drives the Before/After comparison block
   (blocks/_before_after.liquid). Pointer drags and the visually-hidden
   range input both funnel into a single setPos() write path that stores
   the position in the --ba-pos custom property; every visual (clip-path
   reveal, divider line, handle) derives from that var in CSS, so there
   are no per-element style writes and no DOM ids.
   With data-intro="start|end" the divider sweeps from that edge to its
   resting position the first time the frame scrolls into view: --ba-pos is
   registered as a <percentage> so the block's .is-sweeping rule can
   transition it on the merchant's duration and easing. */
   
if (!customElements.get('before-after-slider')) {
  try {
    CSS.registerProperty({ name: '--ba-pos', syntax: '<percentage>', inherits: true, initialValue: '50%' });
  } catch (e) {
    /* already registered, or unsupported (the sweep then just snaps) */
  }

  class BeforeAfterSlider extends HTMLElement {
    connectedCallback() {
      this.vertical = this.dataset.orientation === 'vertical';
      this.input = this.querySelector('.ba__input');
      this.dragging = false;

      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerEnd = this.onPointerEnd.bind(this);
      this.onInput = this.onInput.bind(this);
      this.onFocus = this.onFocus.bind(this);
      this.onBlur = this.onBlur.bind(this);

      this.addEventListener('pointerdown', this.onPointerDown);
      this.addEventListener('pointermove', this.onPointerMove);
      this.addEventListener('pointerup', this.onPointerEnd);
      this.addEventListener('pointercancel', this.onPointerEnd);
      if (this.input) {
        this.input.addEventListener('input', this.onInput);
        this.input.addEventListener('focus', this.onFocus);
        this.input.addEventListener('blur', this.onBlur);
      }

      this.setPos(this.input ? parseFloat(this.input.value) : 50);
      this.setupIntro();
    }

    setupIntro() {
      const from = this.dataset.intro;
      if (!from || this.introDone) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (!('IntersectionObserver' in window)) return;

      this.restPos = parseFloat(this.input ? this.input.value : 50) || 50;
      this.setPos(from === 'end' ? 100 : 0, true);

      this.introObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.stopIntroObserver();
        this.playIntro();
      }, { threshold: 0.5 });
      this.introObserver.observe(this);
    }

    playIntro() {
      this.introDone = true;
      this.onSweepEnd = (event) => {
        if (event && event.target !== this) return;
        this.endSweep();
      };
      this.addEventListener('transitionend', this.onSweepEnd);
      /* Two frames: the edge position is painted before the transition starts. */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.classList.add('is-sweeping');
        this.setPos(this.restPos);
      }));
    }

    endSweep() {
      this.classList.remove('is-sweeping');
      if (this.onSweepEnd) this.removeEventListener('transitionend', this.onSweepEnd);
      this.onSweepEnd = null;
    }

    stopIntroObserver() {
      if (this.introObserver) this.introObserver.disconnect();
      this.introObserver = null;
    }

    disconnectedCallback() {
      this.stopIntroObserver();
      this.endSweep();
      this.removeEventListener('pointerdown', this.onPointerDown);
      this.removeEventListener('pointermove', this.onPointerMove);
      this.removeEventListener('pointerup', this.onPointerEnd);
      this.removeEventListener('pointercancel', this.onPointerEnd);
      if (this.input) {
        this.input.removeEventListener('input', this.onInput);
        this.input.removeEventListener('focus', this.onFocus);
        this.input.removeEventListener('blur', this.onBlur);
      }
    }

    onPointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.dragging = true;
      /* A drag takes over at once; an unplayed sweep is dropped. */
      this.stopIntroObserver();
      this.introDone = true;
      this.endSweep();
      this.setPointerCapture(event.pointerId);
      this.setPosFromEvent(event);
    }

    onPointerMove(event) {
      if (!this.dragging) return;
      this.setPosFromEvent(event);
    }

    onPointerEnd() {
      this.dragging = false;
    }

    onInput() {
      this.stopIntroObserver();
      this.introDone = true;
      this.endSweep();
      this.setPos(parseFloat(this.input.value));
    }

    onFocus() {
      this.classList.add('is-focused');
    }

    onBlur() {
      this.classList.remove('is-focused');
    }

    setPosFromEvent(event) {
      const rect = this.getBoundingClientRect();
      const pct = this.vertical
        ? ((event.clientY - rect.top) / rect.height) * 100
        : ((event.clientX - rect.left) / rect.width) * 100;
      this.setPos(pct);
    }

    setPos(pct, visualOnly) {
      if (isNaN(pct)) pct = 50;
      pct = Math.max(0, Math.min(100, pct));
      this.style.setProperty('--ba-pos', pct + '%');
      if (this.input && !visualOnly) this.input.value = pct;
    }
  }
  customElements.define('before-after-slider', BeforeAfterSlider);
}
