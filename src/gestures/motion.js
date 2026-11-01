// Speeds are in palm lengths per second, so they don't depend on camera distance.
export const MIN_SPEED = 0.8; // vertical movement slower than this is treated as drift/jitter
export const GAIN = 0.6; // size change per palm of vertical travel (exponential: 1 palm up = x1.8)

export function createMotionTracker() {
  let prev = null;

  return {
    // shape: result of measureHand. now: ms.
    // Returns { dy, speed, vSpeed, factor }: dy = palms moved up this frame (negative = down),
    // speed = total speed, vSpeed = vertical speed, factor = size multiplier for this frame.
    update(shape, now) {
      let dy = 0;
      let speed = 0;
      let vSpeed = 0;

      if (prev) {
        const dt = (now - prev.t) / 1000;
        if (dt > 0 && dt < 0.25) {
          // longer gaps mean the hand was lost, so we don't count them as movement
          const dx = (shape.palmX - prev.x) / shape.palmSize;
          dy = (prev.y - shape.palmY) / shape.palmSize; // up is positive
          speed = Math.hypot(dx, dy) / dt;
          vSpeed = Math.abs(dy) / dt;
        }
      }
      prev = { x: shape.palmX, y: shape.palmY, t: now };

      const factor = vSpeed >= MIN_SPEED ? Math.exp(GAIN * dy) : 1;
      return { dy, speed, vSpeed, factor };
    },

    reset() {
      prev = null;
    },
  };
}