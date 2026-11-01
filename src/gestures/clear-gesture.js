export const HOLD_MS = 1200; // how long both hands must stay open and still
export const STILL_SPEED = 1.0; // palms per second

// "Clear all": two open hands, still, for HOLD_MS.
export function createClearGesture() {
  let since = null;
  let fired = false;

  return {
    // hands: state.hands. holdingAny: is any hand holding an image?
    // hasImages: is there anything to clear? now: ms.
    update(hands, holdingAny, hasImages, now) {
      const ready =
        hasImages &&
        !holdingAny &&
        hands.length === 2 &&
        hands.every((h) => h.shape.open && h.pinch && !h.pinch.pinching && h.motion.speed < STILL_SPEED);

      if (!ready) {
        since = null;
        fired = false;
        return { progress: 0, triggered: false, anchor: null };
      }

      const anchor = {
        x: (hands[0].shape.palmX + hands[1].shape.palmX) / 2,
        y: (hands[0].shape.palmY + hands[1].shape.palmY) / 2,
      };
      if (fired) return { progress: 0, triggered: false, anchor }; // wait until the hands change

      since ??= now;
      const progress = Math.min(1, (now - since) / HOLD_MS);
      if (progress >= 1) {
        fired = true;
        return { progress: 0, triggered: true, anchor };
      }
      return { progress, triggered: false, anchor };
    },
  };
}