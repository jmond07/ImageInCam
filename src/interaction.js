const REGRAB_FAST_MS = 250; // same hand pinching again this soon re-grabs, at any distance
const REGRAB_MS = 400; // up to here it re-grabs only if close enough
const REGRAB_DISTANCE = 0.2; // fraction of canvas width

export function createInteraction(scene, log = () => {}) {
  const states = {}; // hand id -> { wasPinching, held, missingSince }
  let lastReleased = null; // { item, time, id, dx, dy } (shared between hands)

  const stateFor = (id) =>
    (states[id] ??= { wasPinching: false, held: null, missingSince: null });
  const tag = (id) => `H${id + 1}`;

  function release(id, s, now) {
    if (!s.held) return;
    s.held.item.held = false;
    lastReleased = { item: s.held.item, time: now, id, dx: s.held.dx, dy: s.held.dy };
    s.held = null;
  }

  // offset: distance from the fingers to the image center. If not given, it's
  // computed from where the fingers are right now.
  function grab(s, item, x, y, canvas, offset) {
    item.held = true;
    scene.bringToFront(item);
    s.held = {
      item,
      dx: offset ? offset.dx : item.x * canvas.width - x,
      dy: offset ? offset.dy : item.y * canvas.height - y,
    };
  }

  // Info about the image that was just released, to decide between re-grab and spawn
  function recentInfo(id, x, y, canvas, now) {
    if (!lastReleased || !scene.has(lastReleased.item)) return null;
    const dt = now - lastReleased.time;
    if (dt > REGRAB_MS) return null;
    const cx = lastReleased.item.x * canvas.width;
    const cy = lastReleased.item.y * canvas.height;
    const sameHand = lastReleased.id === id;
    return {
      item: lastReleased.item,
      dt,
      d: Math.hypot(x - cx, y - cy),
      sameHand,
      // Same hand: keep the grip it had before the flicker, so the image stays
      // glued to the fingers. Another hand: center the image on the fingers.
      offset: sameHand ? { dx: lastReleased.dx, dy: lastReleased.dy } : { dx: 0, dy: 0 },
    };
  }

  return {
    isHolding(id) {
      return !!states[id]?.held;
    },

    holdingAny() {
      return Object.values(states).some((s) => s.held);
    },

    // hands: state.hands. stamp: the selected stamp. now: ms. isActive(id): hand slot still alive.
    update(hands, canvas, stamp, now, isActive) {
      const present = new Set();

      for (const hand of hands) {
        if (!hand.pinch) continue;
        const id = hand.id;
        present.add(id);
        const s = stateFor(id);
        const { x, y, pinching } = hand.pinch;

        if (s.missingSince !== null) {
          log(`${tag(id)} BACK after ${Math.round(now - s.missingSince)}ms`);
          s.missingSince = null;
        }

        // Pinch just started: grab what's under the fingers, re-grab the last one, or spawn
        if (pinching && !s.wasPinching) {
          const hit = scene.hitTest(x, y, canvas);
          const recent = recentInfo(id, x, y, canvas, now);
          const canRegrab =
            recent &&
            !recent.item.held &&
            ((recent.sameHand && recent.dt < REGRAB_FAST_MS) ||
              recent.d < REGRAB_DISTANCE * canvas.width);

          if (hit) {
            if (!hit.held) {
              grab(s, hit, x, y, canvas);
              log(`${tag(id)} GRAB`);
            }
          } else if (canRegrab) {
            grab(s, recent.item, x, y, canvas, recent.offset);
            log(`${tag(id)} REGRAB ${Math.round(recent.dt)}ms ${Math.round(recent.d)}px`);
          } else if (stamp) {
            grab(s, scene.add(stamp, x, y, canvas), x, y, canvas);
            log(
              recent
                ? `${tag(id)} SPAWN (released ${Math.round(recent.dt)}ms ago, ${Math.round(recent.d)}px away)`
                : `${tag(id)} SPAWN`
            );
          }
        }

        if (pinching && s.held) {
          scene.moveTo(s.held.item, x + s.held.dx, y + s.held.dy, canvas);
        } else if (!pinching) {
          if (s.held) {
            log(`${tag(id)} RELEASE open(${hand.pinch.event ?? 'after-gap'}) r=${hand.pinch.ratio.toFixed(2)}`);
          }
          release(id, s, now);
        }

        s.wasPinching = pinching;
      }

      // Hands that aren't in this frame
      for (const [key, s] of Object.entries(states)) {
        const id = Number(key);
        if (present.has(id)) continue;

        if (!isActive(id)) {
          // Id expired: now it really lets go
          if (s.held) log(`${tag(id)} RELEASE lost`);
          release(id, s, now);
          s.wasPinching = false;
          s.missingSince = null;
        } else if (s.held && s.missingSince === null) {
          s.missingSince = now;
          log(`${tag(id)} LOST while holding`);
        }
      }

      // Conductor: a free hand moving up/down resizes the image the other hand holds
      const holders = hands.filter((h) => states[h.id]?.held);
      if (holders.length === 1) {
        const item = states[holders[0].id].held.item;
        const conductor = hands.find(
          (h) => h.id !== holders[0].id && h.pinch && !h.pinch.pinching && h.motion
        );
        if (conductor && conductor.motion.factor !== 1) {
          scene.scaleBy(item, conductor.motion.factor);
        }
      }
    },

    releaseAll() {
      for (const [key, s] of Object.entries(states)) {
        release(Number(key), s, 0);
        s.missingSince = null;
      }
      lastReleased = null;
    },
  };
}