const REGRAB_FAST_MS = 250; // same hand pinching again this soon re-grabs, at any distance
const REGRAB_MS = 400; // up to here it re-grabs only if close enough
const REGRAB_DISTANCE = 0.2; // fraction of canvas width

// Resize: free hand with thumb + middle finger touching, moving up/down
const RESIZE_GAIN = 0.6; // size change per palm of travel (exponential: 1 palm up = x1.8)
const RESIZE_DEADZONE = 0.15; // palms around the starting height where nothing happens
const RESIZE_SMOOTHING = 0.35; // 0..1, lower = steadier but slower to react

export function createInteraction(scene, log = () => {}, history = null) {
  const states = {}; // hand id -> { wasPinching, armed, zoneArmed, held, missingSince }
  let lastReleased = null; // { item, time, id, dx, dy } (shared between hands)
  let resize = null; // { handId, item, startWidth, startY, smoothY }

  const stateFor = (id) =>
    (states[id] ??= {
      wasPinching: false,
      armed: false, // saw an open hand (anywhere): a new pinch may start
      zoneArmed: false, // saw an open hand inside the active zone: a spawn may start
      held: null,
      missingSince: null,
    });
  const tag = (id) => `H${id + 1}`;

  function release(id, s, now) {
    if (!s.held) return;
    s.held.item.held = false;
    lastReleased = { item: s.held.item, time: now, id, dx: s.held.dx, dy: s.held.dy };
    s.held = null;
    // Once nobody holds anything, the undo step can close
    if (!Object.values(states).some((st) => st.held)) history?.end(now);
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

  // One hand holds an image, the other one (thumb + middle touching) scales it
  function updateResize(hands) {
    const holders = hands.filter((h) => states[h.id]?.held);
    const holder = holders.length === 1 ? holders[0] : null;
    const clutchHand = holder
      ? hands.find((h) => h.id !== holder.id && h.pinch?.clutch && !h.shape.pointing)
      : null;

    if (!holder || !clutchHand) {
      if (resize) {
        log(`RESIZE end (${(resize.item.width * 100).toFixed(0)}%)`);
        resize = null;
      }
      return;
    }

    const item = states[holder.id].held.item;
    if (!resize || resize.item !== item || resize.handId !== clutchHand.id) {
      resize = {
        handId: clutchHand.id,
        item,
        startWidth: item.width,
        startY: clutchHand.shape.palmY,
        smoothY: clutchHand.shape.palmY,
      };
      log(`${tag(clutchHand.id)} RESIZE start`);
    }

    resize.smoothY += (clutchHand.shape.palmY - resize.smoothY) * RESIZE_SMOOTHING;
    let dy = (resize.startY - resize.smoothY) / clutchHand.shape.palmSize; // up is positive
    dy = Math.sign(dy) * Math.max(0, Math.abs(dy) - RESIZE_DEADZONE);
    scene.setWidth(item, resize.startWidth * Math.exp(RESIZE_GAIN * dy));
  }

  return {
    isHolding(id) {
      return !!states[id]?.held;
    },

    holdingAny() {
      return Object.values(states).some((s) => s.held);
    },

    // Scales every image being held (mouse wheel). Returns true if anything changed.
    scaleHeld(factor) {
      let changed = false;
      for (const s of Object.values(states)) {
        if (s.held) {
          scene.setWidth(s.held.item, s.held.item.width * factor);
          changed = true;
        }
      }
      return changed;
    },

    // Width (fraction of canvas) of the image being resized, or null
    get resizeWidth() {
      return resize ? resize.item.width : null;
    },

    // hands: state.hands. stamp: the selected stamp. now: ms. isActive(id): hand slot still alive.
    update(hands, canvas, stamp, now, isActive) {
      const present = new Set();

      for (const hand of hands) {
        if (!hand.pinch) continue;
        const id = hand.id;
        present.add(id);
        const s = stateFor(id);
        const { x, y } = hand.pinch;

        // A NEW pinch needs an open hand first (so a closed hand drifting in doesn't
        // count) and can't start while pointing or with the hand cut off by the frame
        // edge. A pinch that is already going is never cut. Grabbing works anywhere;
        // spawning a new image needs the hand to be inside the active zone, having
        // been open there.
        const raw = hand.pinch.pinching;
        const eligible = !hand.shape.pointing && !hand.shape.partial;
        const pinching = raw && (s.wasPinching || s.armed);
        const canSpawn = hand.active && s.zoneArmed;
        if (!eligible) {
          s.armed = false;
          s.zoneArmed = false;
        } else if (!raw) {
          s.armed = true;
          s.zoneArmed = hand.active;
        }

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
              history?.begin();
              grab(s, hit, x, y, canvas);
              log(`${tag(id)} GRAB`);
            }
          } else if (canRegrab) {
            history?.begin();
            grab(s, recent.item, x, y, canvas, recent.offset);
            log(`${tag(id)} REGRAB ${Math.round(recent.dt)}ms ${Math.round(recent.d)}px`);
          } else if (stamp && canSpawn) {
            history?.begin(); // snapshot BEFORE the new image exists
            grab(s, scene.add(stamp, x, y, canvas), x, y, canvas);
            log(
              recent
                ? `${tag(id)} SPAWN (released ${Math.round(recent.dt)}ms ago, ${Math.round(recent.d)}px away)`
                : `${tag(id)} SPAWN`
            );
          } else if (stamp) {
            log(`${tag(id)} NO SPAWN (outside the zone, or hand wasn't open there)`);
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
          s.armed = false;
          s.zoneArmed = false;
          s.missingSince = null;
        } else if (s.held && s.missingSince === null) {
          s.missingSince = now;
          log(`${tag(id)} LOST while holding`);
        }
      }

      updateResize(hands);
    },

    releaseAll() {
      for (const [key, s] of Object.entries(states)) {
        release(Number(key), s, 0);
        s.missingSince = null;
      }
      lastReleased = null;
      resize = null;
    },
  };
}