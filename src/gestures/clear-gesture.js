export const HOLD_MS = 1200; // how long both hands must stay open and still
export const STILL_SPEED = 2.0; // palms per second (smoothed). Higher = more tolerant
export const GRACE_MS = 300; // conditions may fail this long without restarting the count

// "Clear all": two open hands, still, for HOLD_MS.
export function createClearGesture() {
  let since = null;
  let fired = false;
  let lastReady = -Infinity;
  let lastAnchor = null;

  return {
    // hands: state.hands. holdingAny: is any hand holding an image?
    // hasImages: is there anything to clear? now: ms.
    update(hands, holdingAny, hasImages, now) {
      const ready =
        hasImages &&
        !holdingAny &&
        hands.length === 2 &&
        hands.every(
          (h) => h.shape.open && h.pinch && !h.pinch.pinching && h.motion.speed < STILL_SPEED
        );

      if (ready) {
        lastReady = now;
        lastAnchor = {
          x: (hands[0].shape.palmX + hands[1].shape.palmX) / 2,
          y: (hands[0].shape.palmY + hands[1].shape.palmY) / 2,
        };
      }

      // A short hiccup doesn't cancel the count
      const alive = ready || (since !== null && now - lastReady < GRACE_MS);
      if (!alive) {
        since = null;
        fired = false;
        return { progress: 0, triggered: false, anchor: null };
      }
      if (fired) return { progress: 0, triggered: false, anchor: lastAnchor }; // wait until hands change

      since ??= now;
      const progress = Math.min(1, (now - since) / HOLD_MS);
      if (progress >= 1) {
        fired = true;
        return { progress: 0, triggered: true, anchor: lastAnchor };
      }
      return { progress, triggered: false, anchor: lastAnchor };
    },
  };
}