/*
  Image Filled Text, video mode (<image-filled-text>, blocks/image_filled_text).
  CSS can only clip images to text, so this paints the block's own laid-out
  letters (word by word, read from the live DOM so rich text, wrapping and
  fonts match) into a canvas and uses it as the video layer's mask. Repaints
  on resize and font loads; plays the video only while it is on screen.
*/
(() => {
  if (customElements.get('image-filled-text')) return;

  const MAX_PIXELS = 16000000;

  const transform = (text, mode, first) => {
    if (mode === 'uppercase') return text.toUpperCase();
    if (mode === 'lowercase') return text.toLowerCase();
    if (mode === 'capitalize' && first) return text.charAt(0).toUpperCase() + text.slice(1);
    return text;
  };

  class ImageFilledText extends HTMLElement {
    connectedCallback() {
      if (this.iftReady) return;
      this.text = this.querySelector('[data-ift-text]');
      this.media = this.querySelector('[data-ift-media]');
      this.video = this.media && this.media.querySelector('video');
      if (!this.text || !this.video) return;
      // Reduced motion: the video's cover image stays painted in the letters.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      this.iftReady = true;
      this.paintId = 0;
      this.schedule = this.schedule.bind(this);

      this.resizeObserver = new ResizeObserver(this.schedule);
      this.resizeObserver.observe(this.text);

      this.viewObserver = new IntersectionObserver(
        (entries) => this.toggle(entries[entries.length - 1].isIntersecting),
        { rootMargin: '200px 0px' }
      );
      this.viewObserver.observe(this);

      if (document.fonts) {
        document.fonts.ready.then(this.schedule);
        document.fonts.addEventListener('loadingdone', this.schedule);
      }
      this.schedule();
    }

    disconnectedCallback() {
      if (!this.iftReady) return;
      this.iftReady = false;
      this.resizeObserver.disconnect();
      this.viewObserver.disconnect();
      if (document.fonts) document.fonts.removeEventListener('loadingdone', this.schedule);
      cancelAnimationFrame(this.frame);
      if (this.maskUrl) URL.revokeObjectURL(this.maskUrl);
      this.maskUrl = null;
    }

    schedule() {
      if (!this.iftReady) return;
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.paint());
    }

    toggle(visible) {
      if (visible) {
        const playing = this.video.play();
        if (playing) playing.catch(() => {});
      } else {
        this.video.pause();
      }
    }

    paint() {
      const box = this.media.getBoundingClientRect();
      if (!box.width || !box.height) return;

      let ratio = Math.min(window.devicePixelRatio || 1, 2);
      const area = box.width * box.height;
      if (area * ratio * ratio > MAX_PIXELS) ratio = Math.sqrt(MAX_PIXELS / area);

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(box.width * ratio);
      canvas.height = Math.ceil(box.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      const canSpace = 'letterSpacing' in ctx;
      const range = document.createRange();
      const walker = document.createTreeWalker(this.text, NodeFilter.SHOW_TEXT);
      const words = /\S+/g;

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const style = getComputedStyle(node.parentElement);
        if (style.visibility === 'hidden') continue;

        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.direction = style.direction === 'rtl' ? 'rtl' : 'ltr';
        const spacing = parseFloat(style.letterSpacing) || 0;
        if (canSpace) ctx.letterSpacing = `${spacing}px`;

        const metrics = ctx.measureText('Hg');
        const ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
        const descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;
        const draw = (str, rect, first) => {
          const baseline = rect.top - box.top + (rect.height - ascent - descent) / 2 + ascent;
          ctx.fillText(transform(str, style.textTransform, first), rect.left - box.left, baseline);
        };

        words.lastIndex = 0;
        for (let match = words.exec(node.data); match; match = words.exec(node.data)) {
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rects = range.getClientRects();
          if (rects.length === 1 && (canSpace || spacing === 0)) {
            draw(match[0], rects[0], true);
            continue;
          }
          // A word split across lines, or spacing canvas can't apply: per character.
          for (let i = 0; i < match[0].length; ) {
            const size = match[0].codePointAt(i) > 0xffff ? 2 : 1;
            range.setStart(node, match.index + i);
            range.setEnd(node, match.index + i + size);
            const rect = range.getClientRects()[0];
            if (rect) draw(match[0].slice(i, i + size), rect, i === 0);
            i += size;
          }
        }
      }

      const id = ++this.paintId;
      canvas.toBlob((blob) => {
        if (!blob || id !== this.paintId || !this.iftReady) return;
        const url = URL.createObjectURL(blob);
        this.media.style.webkitMaskImage = `url("${url}")`;
        this.media.style.maskImage = `url("${url}")`;
        if (this.maskUrl) URL.revokeObjectURL(this.maskUrl);
        this.maskUrl = url;
        this.classList.add('is-masked');
      });
    }
  }

  customElements.define('image-filled-text', ImageFilledText);
})();
