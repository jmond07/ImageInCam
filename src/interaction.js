const REGRAB_MS = 400; // a new pinch this soon after a release...
const REGRAB_DISTANCE = 0.2; // ...and this close (fraction of canvas width) re-grabs the same image

export function createInteraction(scene) {
  const states = {}; // hand id -> { wasPinching, held, last }

  const stateFor = (id) => (states[id] ??= { wasPinching: false, held: null, last: null });

  function release(s, now) {
    if (s.held) {
      s.held.item.held = false;
      s.last = { item: s.held.item, time: now };
      s.held = null;
    }
  }

  function grab(s, item, x, y, canvas) {
    item.held = true;
    scene.bringToFront(item);
    // Keep the offset so the image doesn't jump to the fingers
    s.held = { item, dx: item.x * canvas.width - x, dy: item.y * canvas.height - y };
  }

  // The image this hand just let go of, if the new pinch is right next to it
  function recentItem(s, x, y, canvas, now) {
    if (!s.last || now - s.last.time > REGRAB_MS || !scene.has(s.last.item)) return null;
    const cx = s.last.item.x * canvas.width;
    const cy = s.last.item.y * canvas.height;
    return Math.hypot(x - cx, y - cy) < REGRAB_DISTANCE * canvas.width ? s.last.item : null;
  }

  return {
    // hands: state.hands. stamp: the selected stamp. now: ms. isActive(id): hand slot still alive.
    update(hands, canvas, stamp, now, isActive) {
      const present = new Set();

      for (const hand of hands) {
        if (!hand.pinch) continue;
        present.add(hand.id);
        const s = stateFor(hand.id);
        const { x, y, pinching } = hand.pinch;

        // Pinch just started: grab what's under the fingers, re-grab the last one, or spawn
        if (pinching && !s.wasPinching) {
          const target = scene.hitTest(x, y, canvas) ?? recentItem(s, x, y, canvas, now);
          if (target) {
            if (!target.held) grab(s, target, x, y, canvas);
          } else if (stamp) {
            grab(s, scene.add(stamp, x, y, canvas), x, y, canvas);
          }
        }

        if (pinching && s.held) {
          scene.moveTo(s.held.item, x + s.held.dx, y + s.held.dy, canvas);
        } else if (!pinching) {
          release(s, now);
        }

        s.wasPinching = pinching;
      }

      // A hand that vanished only lets go once its id expires (grace period)
      for (const [id, s] of Object.entries(states)) {
        if (!present.has(Number(id)) && !isActive(Number(id))) {
          release(s, now);
          s.wasPinching = false;
        }
      }
    },

    releaseAll() {
      for (const s of Object.values(states)) {
        release(s, 0);
        s.last = null;
      }
    },
  };
}