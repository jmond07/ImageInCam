const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

// Pinch turns ON below this ratio and OFF above the other one (hysteresis).
// Ratio = thumb-index distance / palm length, so it doesn't depend on camera distance.
export const PINCH_ON = 0.3;
export const PINCH_OFF = 0.5;

// 0..1. Higher = the point follows the fingers faster but jitters more
const SMOOTHING = 0.5;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createPinchTracker() {
  let pinching = false;
  let smooth = null;

  return {
    // points: 21 normalized landmarks. width/height: canvas size in px.
    update(points, width, height) {
      const px = points.map((p) => ({ x: p.x * width, y: p.y * height }));
      const palm = dist(px[WRIST], px[MIDDLE_MCP]) || 1;
      const ratio = dist(px[THUMB_TIP], px[INDEX_TIP]) / palm;

      if (!pinching && ratio < PINCH_ON) pinching = true;
      else if (pinching && ratio > PINCH_OFF) pinching = false;

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

      return { pinching, ratio, x: smooth.x, y: smooth.y };
    },

    // Call when the hand leaves the frame
    reset() {
      pinching = false;
      smooth = null;
    },
  };
}