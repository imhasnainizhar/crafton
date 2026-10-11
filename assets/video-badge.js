/**
 * <video-badge> — shows the remaining time of the nearest video.
 *
 * Binding contract (blocks/video_badge.liquid documents the merchant-facing half):
 *   A block that owns a video marks its media wrapper [data-video-scope] and the
 *   <video> element itself [data-video-timed]. The badge resolves its source in
 *   this order:
 *     1. closest('[data-video-scope]') -> video[data-video-timed] inside it
 *     2. the previous element sibling, if it is or contains such a video
 *     3. the next element sibling, likewise
 *
 * When nothing resolves the badge removes itself, so a badge placed on a card
 * with no video renders nothing rather than a permanent "0:00".
 *
 * The badge only reads time; it never starts playback. The owning card keeps
 * control of its own play button.
 */
(function () {
  if (customElements.get('video-badge')) return;

  var VIDEO_SELECTOR = 'video[data-video-timed]';

  function videoIn(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.matches && el.matches(VIDEO_SELECTOR)) return el;
    return el.querySelector ? el.querySelector(VIDEO_SELECTOR) : null;
  }

  class VideoBadge extends HTMLElement {
    connectedCallback() {
      // The video may be parsed after the badge (overlay content renders above
      // the media in some card layouts), so retry once on the next frame.
      this.bind();
      if (!this.video) requestAnimationFrame(() => this.bind());
    }

    disconnectedCallback() {
      this.unbind();
    }

    bind() {
      if (this.video) return;

      var scope = this.closest('[data-video-scope]');
      var video =
        (scope && scope.querySelector(VIDEO_SELECTOR)) ||
        videoIn(this.previousElementSibling) ||
        videoIn(this.nextElementSibling);

      if (!video) {
        // Nothing to time. Stay out of the layout entirely.
        this.hidden = true;
        return;
      }

      this.hidden = false;
      this.video = video;

      this.onTimeChange = () => this.updateDuration();
      this.onEnded = () => this.render(0);

      this.video.addEventListener('loadedmetadata', this.onTimeChange);
      this.video.addEventListener('durationchange', this.onTimeChange);
      this.video.addEventListener('timeupdate', this.onTimeChange);
      this.video.addEventListener('ended', this.onEnded);

      this.updateDuration();
    }

    unbind() {
      if (!this.video) return;
      this.video.removeEventListener('loadedmetadata', this.onTimeChange);
      this.video.removeEventListener('durationchange', this.onTimeChange);
      this.video.removeEventListener('timeupdate', this.onTimeChange);
      this.video.removeEventListener('ended', this.onEnded);
      this.video = null;
    }

    updateDuration() {
      var duration = this.video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      this.render(Math.max(0, Math.ceil(duration - this.video.currentTime)));
    }

    render(totalSeconds) {
      var minutes = Math.floor(totalSeconds / 60);
      var seconds = Math.floor(totalSeconds % 60);
      this.textContent = minutes + ':' + (seconds < 10 ? '0' + seconds : seconds);
    }
  }

  customElements.define('video-badge', VideoBadge);
})();
