export const HOLD_MS = 900; // how long to keep pointing at an image
export const GRACE_MS = 250; // the pose may break this long without restarting the count

// "Delete one": point at an image (index out, other fingers curled) and hold.
export function createDeleteGesture() {
  let target = null;
  let since = null;
  let lastSeen = -Infinity;
  let blocked = false; // after a delete, the finger must leave before another one starts

  return {
    // hands: state.hands. holdingAny: is any hand holding an image? now: ms.
    // Returns { progress, item, triggered }
    update(hands, scene, canvas, holdingAny, now) {
      let found = null;
      if (!holdingAny) {
        for (const h of hands) {
          if (!h.shape.pointing || h.shape.partial) continue;
          const item = scene.hitTest(h.shape.indexTip.x, h.shape.indexTip.y, canvas);
          if (item && !item.held) {
            found = item;
            break;
          }
        }
      }

      if (!found) blocked = false;
      const candidate = blocked ? null : found;

      if (candidate) {
        if (candidate !== target) {
          target = candidate;
          since = now;
        }
        lastSeen = now;
      } else if (target && now - lastSeen > GRACE_MS) {
        target = null;
        since = null;
      }

      if (!target) return { progress: 0, item: null, triggered: false };

      const progress = Math.min(1, (now - since) / HOLD_MS);
      if (progress >= 1) {
        const item = target;
        target = null;
        since = null;
        blocked = true;
        return { progress: 0, item, triggered: true };
      }
      return { progress, item: target, triggered: false };
    },

    reset() {
      target = null;
      since = null;
      blocked = false;
    },
  };
}