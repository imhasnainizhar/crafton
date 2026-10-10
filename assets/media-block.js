/**
 * <media-autoplay> — plays the muted videos it wraps while they are on screen
 * and pauses them once they scroll away, so offscreen media stops decoding.
 */
if (!customElements.get('media-autoplay')) {
  customElements.define(
    'media-autoplay',
    class extends HTMLElement {
      connectedCallback() {
        this.videos = this.querySelectorAll('video');
        if (this.videos.length === 0) return;

        this.observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              this.videos.forEach((video) => {
                if (entry.isIntersecting) {
                  // play() rejects when the browser blocks autoplay; the poster stays visible.
                  video.play().catch(() => {});
                } else {
                  video.pause();
                }
              });
            });
          },
          { threshold: 0.05 }
        );

        this.observer.observe(this);
      }

      disconnectedCallback() {
        if (this.observer) this.observer.disconnect();
      }
    }
  );
}
