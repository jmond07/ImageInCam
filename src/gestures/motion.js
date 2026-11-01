// Speed in palm lengths per second, so it doesn't depend on camera distance.
const SPEED_SMOOTHING = 0.4; // 0..1, higher = reacts faster, lower = steadier

export function createMotionTracker() {
  let prev = null;
  let speed = 0;

  return {
    // shape: result of measureHand. now: ms. Returns { speed } (smoothed).
    update(shape, now) {
      if (prev) {
        const dt = (now - prev.t) / 1000;
        if (dt > 0 && dt < 0.25) {
          const dx = (shape.palmX - prev.x) / shape.palmSize;
          const dy = (shape.palmY - prev.y) / shape.palmSize;
          const raw = Math.hypot(dx, dy) / dt;
          speed += (raw - speed) * SPEED_SMOOTHING;
        } else {
          speed = 0; // long gap: the hand was lost, start over
        }
      }
      prev = { x: shape.palmX, y: shape.palmY, t: now };
      return { speed };
    },

    reset() {
      prev = null;
      speed = 0;
    },
  };
}