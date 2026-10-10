/*
 * <truncate-text> — collapses rich text to a set number of lines with an
 * inline "read more" trigger (floated onto the last clamped line). Two modes:
 *   - inline: expands/collapses height in place with a max-height transition;
 *     while expanded the trigger moves to the end of the text.
 *   - dialog: opens the full text in a panel. On a Centered Popover it scales
 *     out from the direction of the trigger (transform-origin taken from the
 *     trigger's position on screen) with a macOS-style ease; on a Bottom
 *     Sheet Drawer (opted in per block, mobile viewports only) it instead
 *     slides up, driven entirely by the CSS transition on .is-open. Either
 *     way the scrolling body fades at whichever end still has content past it.
 */
if (!customElements.get('truncate-text')) {
  class TruncateText extends HTMLElement {
    connectedCallback() {
      this.contentEl = this.querySelector('.truncate-text__content');
      this.toggleBtn = this.querySelector('.truncate-text__toggle');
      this.spacerEl = this.querySelector('.truncate-text__spacer');
      this.dialog = this.querySelector('.truncate-text__dialog');
      this.mode = this.dataset.mode || 'inline';
      this.duration = parseInt(this.dataset.transition, 10) || 300;
      this.lines = parseInt(this.dataset.lines, 10) || 3;

      if (this.toggleBtn) {
        this.toggleBtn.addEventListener('click', () => this.onToggle());
      }

      if (this.dialog) {
        this.popoverDuration = parseInt(this.dataset.popoverDuration, 10) || 420;
        this.scrollEl = this.dialog.querySelector('.truncate-text__scroll');
        if (this.scrollEl) {
          this.updateFades = () => this.setScrollFades();
          this.scrollEl.addEventListener('scroll', this.updateFades, { passive: true });
          window.addEventListener('resize', this.updateFades);
        }
        const closeBtn = this.dialog.querySelector('.truncate-text__close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeDialog());
        // Click on the backdrop (the dialog element itself) closes it.
        this.dialog.addEventListener('click', (event) => {
          if (event.target === this.dialog) this.closeDialog();
        });
        // Esc: run the slide-out animation instead of closing instantly.
        this.dialog.addEventListener('cancel', (event) => {
          event.preventDefault();
          this.closeDialog();
        });
      }

      this.hideToggleIfNotNeeded();
    }

    hideToggleIfNotNeeded() {
      if (!this.contentEl || !this.toggleBtn) return;
      requestAnimationFrame(() => {
        // Measure without the floated trigger/spacer — they pad the box out
        // to the clamp height even when the text itself fits.
        this.toggleBtn.style.display = 'none';
        if (this.spacerEl) this.spacerEl.style.display = 'none';
        const truncated = this.contentEl.scrollHeight > this.contentEl.clientHeight + 1;
        if (truncated) {
          this.toggleBtn.style.display = '';
          if (this.spacerEl) this.spacerEl.style.display = '';
        }
      });
    }

    onToggle() {
      if (this.mode === 'dialog') {
        this.openDialog();
        return;
      }
      if (this.hasAttribute('expanded')) {
        this.collapse();
      } else {
        this.expand();
      }
    }

    // Scroll fades are painted with a mask, so the faded edge shows the
    // popover's own background — no colour needs to be duplicated in CSS.
    setScrollFades() {
      if (!this.scrollEl) return;
      const { scrollTop, scrollHeight, clientHeight } = this.scrollEl;
      this.scrollEl.toggleAttribute('data-fade-top', scrollTop > 2);
      this.scrollEl.toggleAttribute('data-fade-bottom', scrollTop + clientHeight < scrollHeight - 2);
    }

    // The popover always lands centred; only where it grows *from* follows the
    // trigger, by pinning transform-origin at the trigger's point on screen.
    setPopoverOrigin() {
      if (!this.toggleBtn) return;
      const rect = this.dialog.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const btn = this.toggleBtn.getBoundingClientRect();
      const clamp = (value, max) => Math.max(0, Math.min(value, max));
      const originX = clamp(btn.left + btn.width / 2 - rect.left, rect.width);
      const originY = clamp(btn.top + btn.height / 2 - rect.top, rect.height);
      this.dialog.style.transformOrigin = originX + 'px ' + originY + 'px';
    }

    get reducedMotion() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // Drawer layout only takes over below 768px (see the matching CSS
    // breakpoint in snippets/truncate-text.liquid); above it, the same
    // dialog stays a centered popover even when "Mobile Layout" is Drawer.
    get isMobileDrawer() {
      return this.dialog?.dataset.mobileLayout === 'drawer' &&
        window.matchMedia('(max-width: 767.98px)').matches;
    }

    // Belt-and-suspenders alongside showModal(): the backdrop already blocks
    // clicks/wheel on the background, but touch-scroll chaining (iOS) can
    // still reach the body underneath, so pin it explicitly while open.
    lockScroll() {
      if (this.scrollLocked) return;
      this.scrollLocked = true;
      document.body.style.overflow = 'hidden';
    }

    unlockScroll() {
      if (!this.scrollLocked) return;
      this.scrollLocked = false;
      document.body.style.overflow = '';
    }

    openDialog() {
      if (!this.dialog || typeof this.dialog.showModal !== 'function') return;
      const drawer = this.isMobileDrawer;
      this.dialog.showModal();
      this.lockScroll();
      if (!drawer) this.setPopoverOrigin();
      this.setScrollFades();
      // Two frames so the closed state is rendered before the class flips the
      // backdrop and opacity on.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.dialog.classList.add('is-open');
          // Drawer mode slides in via the CSS transition on .is-open instead
          // of this scale-pop, which only suits a centered popover.
          if (drawer || this.reducedMotion || typeof this.dialog.animate !== 'function') return;
          this.popAnimation = this.dialog.animate(
            [
              { transform: 'scale(0.85)', opacity: 0 },
              { transform: 'scale(1)', opacity: 1 }
            ],
            {
              duration: this.popoverDuration,
              // macOS-style: quick to leave, long settle at the end.
              easing: 'cubic-bezier(0.32, 0.72, 0, 1)'
            }
          );
        });
      });
    }

    closeDialog() {
      if (!this.dialog || !this.dialog.open) return;
      this.unlockScroll();
      const finish = () => {
        this.dialog.classList.remove('is-open');
        this.dialog.close();
      };
      if (this.reducedMotion) {
        finish();
        return;
      }
      if (this.isMobileDrawer) {
        // The slide-down is a CSS transition (see the max-width: 767.98px
        // block in the stylesheet); wait for it instead of animating here.
        this.dialog.classList.remove('is-open');
        const onEnd = (event) => {
          if (event.target !== this.dialog || event.propertyName !== 'transform') return;
          this.dialog.removeEventListener('transitionend', onEnd);
          finish();
        };
        this.dialog.addEventListener('transitionend', onEnd);
        return;
      }
      if (typeof this.dialog.animate !== 'function') {
        finish();
        return;
      }
      this.setPopoverOrigin();
      const duration = Math.round(this.popoverDuration * 0.7);
      // Keep the backdrop fading over the same span as the shrink.
      this.dialog.classList.remove('is-open');
      const animation = this.dialog.animate(
        [
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(0.85)', opacity: 0 }
        ],
        { duration: duration, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
      );
      animation.addEventListener('finish', finish, { once: true });
    }

    // While expanded the trigger reads inline at the end of the last
    // paragraph; collapsed it floats onto the last clamped line (after the
    // spacer, before the text, so the floats precede the wrapped content).
    placeToggleInline() {
      const children = Array.from(this.contentEl.children).filter(
        (el) => el !== this.toggleBtn && el !== this.spacerEl
      );
      const last = children[children.length - 1];
      if (last) last.appendChild(this.toggleBtn);
    }

    placeToggleFloated() {
      if (this.spacerEl) {
        this.spacerEl.after(this.toggleBtn);
      } else {
        this.contentEl.prepend(this.toggleBtn);
      }
    }

    expand() {
      const start = this.contentEl.clientHeight;
      this.setAttribute('expanded', '');
      this.placeToggleInline();
      const full = this.contentEl.scrollHeight;
      this.contentEl.style.maxHeight = start + 'px';
      // Force reflow so the browser registers the starting height.
      void this.contentEl.offsetHeight;
      this.contentEl.style.transition = 'max-height ' + this.duration + 'ms ease';
      this.contentEl.style.maxHeight = full + 'px';

      const onEnd = () => {
        this.contentEl.style.maxHeight = 'none';
        this.contentEl.style.transition = '';
        this.contentEl.removeEventListener('transitionend', onEnd);
      };
      this.contentEl.addEventListener('transitionend', onEnd);

      if (this.toggleBtn.dataset.lessText) {
        this.toggleBtn.textContent = this.toggleBtn.dataset.lessText;
      }
    }

    collapse() {
      const styles = getComputedStyle(this.contentEl);
      const lineHeight = parseFloat(styles.lineHeight) || 20;
      const collapsedHeight = lineHeight * this.lines;
      const full = this.contentEl.scrollHeight;

      this.contentEl.style.maxHeight = full + 'px';
      void this.contentEl.offsetHeight;
      this.contentEl.style.transition = 'max-height ' + this.duration + 'ms ease';
      this.contentEl.style.maxHeight = collapsedHeight + 'px';

      const onEnd = () => {
        this.removeAttribute('expanded');
        this.placeToggleFloated();
        this.contentEl.style.maxHeight = '';
        this.contentEl.style.transition = '';
        this.contentEl.removeEventListener('transitionend', onEnd);
      };
      this.contentEl.addEventListener('transitionend', onEnd);

      if (this.toggleBtn.dataset.moreText) {
        this.toggleBtn.textContent = this.toggleBtn.dataset.moreText;
      }
    }
  }

  customElements.define('truncate-text', TruncateText);
}
