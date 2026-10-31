export function createInteraction(scene) {
  const states = {}; // hand label -> { wasPinching, held: { item, dx, dy } | null }

  const stateFor = (label) => (states[label] ??= { wasPinching: false, held: null });

  function release(s) {
    if (s.held) {
      s.held.item.held = false;
      s.held = null;
    }
  }

  function grab(s, item, x, y, canvas) {
    item.held = true;
    scene.bringToFront(item);
    // Keep the offset so the image doesn't jump to the fingers
    s.held = { item, dx: item.x * canvas.width - x, dy: item.y * canvas.height - y };
  }

  return {
    // hands: state.hands. stamp: the currently selected stamp (or undefined)
    update(hands, canvas, stamp) {
      const present = new Set();

      for (const hand of hands) {
        if (!hand.pinch) continue;
        present.add(hand.label);
        const s = stateFor(hand.label);
        const { x, y, pinching } = hand.pinch;

        // Pinch just started: grab what's under the fingers, or spawn a new one
        if (pinching && !s.wasPinching) {
          const hit = scene.hitTest(x, y, canvas);
          if (hit) {
            if (!hit.held) grab(s, hit, x, y, canvas);
          } else if (stamp) {
            grab(s, scene.add(stamp, x, y, canvas), x, y, canvas);
          }
        }

        if (pinching && s.held) {
          scene.moveTo(s.held.item, x + s.held.dx, y + s.held.dy, canvas);
        } else if (!pinching) {
          release(s);
        }

        s.wasPinching = pinching;
      }

      // Hands that left the frame let go of what they were holding
      for (const [label, s] of Object.entries(states)) {
        if (!present.has(label)) {
          release(s);
          s.wasPinching = false;
        }
      }
    },

    releaseAll() {
      for (const s of Object.values(states)) release(s);
    },
  };
}