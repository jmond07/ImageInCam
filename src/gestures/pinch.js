const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;

// Ratios = finger-to-thumb distance / palm length, so they don't depend on camera distance.
export const PINCH_ON = 0.3;
export const PINCH_OFF = 0.5;
// Above this the fingers are clearly open: release right away
export const PINCH_OFF_HARD = 0.9;
// Between OFF and OFF_HARD the fingers must stay open this long to release.
// Absorbs the landmark wobble that happens when the hand moves fast.
export const RELEASE_DELAY_MS = 150;
// Same idea for the resize clutch (thumb + middle finger)
export const CLUTCH_RELEASE_MS = 100;

// 0..1. Higher = the point follows the fingers faster but jitters more
const SMOOTHING = 0.5;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createPinchTracker() {
  let pinching = false;
  let openSince = null;
  let clutch = false;
  let clutchOpenSince = null;
  let smooth = null;

  return {
    // points: 21 normalized landmarks. width/height: canvas px. now: ms timestamp.
    // Returns { pinching, ratio, middleRatio, clutch, x, y, event } where event is what
    // happened THIS frame to the pinch: 'start' | 'hard' | 'delay' | null
    update(points, width, height, now) {
      const px = points.map((p) => ({ x: p.x * width, y: p.y * height }));
      const palm = dist(px[WRIST], px[MIDDLE_MCP]) || 1;
      const ratio = dist(px[THUMB_TIP], px[INDEX_TIP]) / palm;
      const middleRatio = dist(px[THUMB_TIP], px[MIDDLE_TIP]) / palm;

      // Index pinch. It only starts if the index is the finger closest to the thumb,
      // so touching thumb + middle finger doesn't count.
      let event = null;
      if (!pinching) {
        if (ratio < PINCH_ON && ratio <= middleRatio) {
          pinching = true;
          openSince = null;
          event = 'start';
        }
      } else if (ratio > PINCH_OFF_HARD) {
        pinching = false;
        openSince = null;
        event = 'hard';
      } else if (ratio > PINCH_OFF) {
        openSince ??= now;
        if (now - openSince >= RELEASE_DELAY_MS) {
          pinching = false;
          openSince = null;
          event = 'delay';
        }
      } else {
        openSince = null;
      }

      // Resize clutch: thumb + middle finger touching (never while index-pinching)
      if (pinching) {
        clutch = false;
        clutchOpenSince = null;
      } else if (!clutch) {
        if (middleRatio < PINCH_ON && middleRatio < ratio) {
          clutch = true;
          clutchOpenSince = null;
        }
      } else if (middleRatio > PINCH_OFF) {
        clutchOpenSince ??= now;
        if (now - clutchOpenSince >= CLUTCH_RELEASE_MS) {
          clutch = false;
          clutchOpenSince = null;
        }
      } else {
        clutchOpenSince = null;
      }

      // Pinch point = midpoint between thumb and index tips, smoothed
      const raw = {
        x: (px[THUMB_TIP].x + px[INDEX_TIP].x) / 2,
        y: (px[THUMB_TIP].y + px[INDEX_TIP].y) / 2,
      };
      smooth = smooth
        ? {
            x: smooth.x + (raw.x - smooth.x) * SMOOTHING,
            y: smooth.y + (raw.y - smooth.y) * SMOOTHING,
          }
        : raw;

      return { pinching, ratio, middleRatio, clutch, x: smooth.x, y: smooth.y, event };
    },

    // Call when the hand is gone for good
    reset() {
      pinching = false;
      openSince = null;
      clutch = false;
      clutchOpenSince = null;
      smooth = null;
    },
  };
}