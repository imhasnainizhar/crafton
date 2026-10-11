/**
 * <review-card> — play control for blocks/review_card.liquid.
 *
 * The card renders a poster image plus a hidden <video data-video-timed>. On
 * the first click of .review-card__play the video is revealed, given native
 * controls, and started; the play button removes itself.
 *
 * Timing display is NOT handled here — blocks/video_badge.liquid owns that as
 * an independent block and binds to [data-video-timed] on its own. This script
 * is only loaded when the card actually has a video.
 */
(function () {
  if (customElements.get('review-card')) return;

  class ReviewCard extends HTMLElement {
    connectedCallback() {
      this.playButton = this.querySelector('.review-card__play');
      this.video = this.querySelector('.review-card__video');
      if (!this.video || !this.playButton) return;

      this.onPlayClick = () => this.start();
      this.playButton.addEventListener('click', this.onPlayClick);
    }

    disconnectedCallback() {
      if (this.playButton && this.onPlayClick) {
        this.playButton.removeEventListener('click', this.onPlayClick);
      }
    }

    start() {
      this.video.hidden = false;
      this.video.setAttribute('controls', '');
      this.playButton.hidden = true;

      var playback = this.video.play();
      if (playback && playback.catch) playback.catch(function () {});
    }
  }

  customElements.define('review-card', ReviewCard);
})();
