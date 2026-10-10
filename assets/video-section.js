/**
 * <video-section> — behavior for the Video section: click-to-toggle playback
 * with the animated play/pause button, YouTube-style timeline scrubbing, and
 * the full-screen YouTube popover. All elements are queried by class inside
 * the custom element, so any number of Video sections can coexist.
 *
 * Data attributes on the element:
 *   data-youtube-id  — YouTube video id; presence (with the popover markup)
 *                      makes the stage click open the popover instead of
 *                      toggling the background video.
 *   data-autoplay    — video starts playing (the `autoplay` attribute does
 *                      the work); the play button starts hidden.
 */
if (!customElements.get('video-section')) {
  customElements.define(
    'video-section',
    class extends HTMLElement {
      connectedCallback() {
        if (this.initialized) return;
        this.initialized = true;

        const stage = this.querySelector('.video-section__stage');
        const video = this.querySelector('.bg-media-video');
        const playBtn = this.querySelector('.video-play-btn');
        const iconPlay = playBtn ? playBtn.querySelector('.icon-play') : null;
        const iconPause = playBtn ? playBtn.querySelector('.icon-pause') : null;

        const popover = this.querySelector('.yt-popover');
        const iframe = popover ? popover.querySelector('.yt-popover-iframe') : null;
        const closeBtn = popover ? popover.querySelector('.yt-popover-close') : null;
        const youtubeId = this.dataset.youtubeId || '';
        const hasPopover = popover !== null && iframe !== null && youtubeId !== '';
        const autoplay = this.hasAttribute('data-autoplay');

        const setBtnVisualState = (state) => {
          if (!playBtn) return;
          if (iconPlay) iconPlay.style.display = state === 'play' ? 'block' : 'none';
          if (iconPause) iconPause.style.display = state === 'play' ? 'none' : 'block';
        };

        // Autoplaying videos start without the button in the way; it pops
        // back in when the video is paused.
        if (playBtn && autoplay) {
          playBtn.style.opacity = '0';
        }

        const toggleVideoPlayPause = () => {
          if (!video) return;

          if (!playBtn) {
            // Hidden-button mode: clicks still toggle playback silently.
            if (video.paused) {
              video.play().catch(() => {});
            } else {
              video.pause();
            }
            return;
          }

          // Reset animation
          playBtn.classList.remove('animate-scale-pop');
          void playBtn.offsetWidth;

          if (video.paused) {
            // Switching to play: show PLAY icon while popping up
            setBtnVisualState('play');
            playBtn.style.opacity = '1';
            playBtn.classList.add('animate-scale-pop');

            video.play().catch(() => {});

            // Hide button completely after animation ends
            clearTimeout(playBtn.fadeTimeout);
            playBtn.fadeTimeout = setTimeout(() => {
              playBtn.style.opacity = '0';
            }, 450);
          } else {
            // Switching to pause: show PAUSE icon while popping up
            setBtnVisualState('pause');
            playBtn.style.opacity = '1';
            playBtn.classList.add('animate-scale-pop');

            video.pause();

            // Switch back to the play icon so it's clear a click resumes
            clearTimeout(playBtn.fadeTimeout);
            playBtn.fadeTimeout = setTimeout(() => {
              setBtnVisualState('play');
            }, 450);
          }
        };

        if (stage) {
          stage.addEventListener('click', (e) => {
            // Ignore clicks on the timeline and inside the content overlay
            if (e.target.closest('.video-custom-timeline, .mc-content')) return;

            if (hasPopover) {
              // 1. YouTube popover is given priority if enabled
              if (video && !video.paused) {
                video.pause();
                if (playBtn) {
                  playBtn.style.opacity = '1';
                  setBtnVisualState('play');
                }
              }
              popover.classList.add('is-active');
              iframe.src = `https://www.youtube.com/embed/${youtubeId}?rel=0`;
              document.body.style.overflow = 'hidden';
            } else if (video) {
              // 2. Fallback to toggling the background video
              toggleVideoPlayPause();
            }
          });
        }

        // YouTube Popover closure logic
        if (hasPopover && closeBtn) {
          const closePopover = () => {
            popover.classList.remove('is-active');
            iframe.src = '';
            document.body.style.overflow = '';
          };

          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closePopover();
          });
          popover.addEventListener('click', (e) => {
            if (e.target === popover || e.target.classList.contains('yt-popover-scroll')) {
              closePopover();
            }
          });
        }

        // Timeline scrubbing logic
        if (video) {
          const progressBar = this.querySelector('.video-progress-bar');
          const progressFilled = this.querySelector('.video-progress-filled');
          const timeDisplay = this.querySelector('.timeline-time');

          const formatTime = (seconds) => {
            if (isNaN(seconds)) return '0:00';
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s < 10 ? '0' : ''}${s}`;
          };

          if (progressBar && progressFilled) {
            video.addEventListener('loadedmetadata', () => {
              if (timeDisplay) timeDisplay.textContent = `0:00 / ${formatTime(video.duration)}`;
            });

            video.addEventListener('timeupdate', () => {
              if (video.duration) {
                const percent = (video.currentTime / video.duration) * 100;
                progressFilled.style.width = `${percent}%`;
                if (timeDisplay) {
                  timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
                }
              }
            });

            progressBar.addEventListener('click', (e) => {
              e.stopPropagation();
              const rect = progressBar.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              video.currentTime = (clickX / rect.width) * video.duration;
            });
          }
        }
      }
    }
  );
}
