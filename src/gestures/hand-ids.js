const MAX_JUMP = 0.3; // max wrist movement per frame, as a fraction of canvas width
const GRACE_MS = 250; // how long an id survives without being seen
const HOLD_GRACE_MS = 600; // longer while that hand is holding an image

// Gives each hand a stable id (0 or 1) by following where its wrist was
// in the previous frame. We don't trust MediaPipe's Left/Right label for this.
export function createHandIds() {
  const slots = [null, null]; // each: { wrist: {x, y}, lastSeen } | null

  return {
    // wrists: [{x, y}] in canvas px. isHolding(id): is that hand holding an image?
    // Returns one id per wrist (or null).
    assign(wrists, width, now, isHolding = () => false) {
      slots.forEach((s, i) => {
        const grace = isHolding(i) ? HOLD_GRACE_MS : GRACE_MS;
        if (s && now - s.lastSeen > grace) slots[i] = null;
      });

      const ids = new Array(wrists.length).fill(null);
      const taken = new Set();

      // Match hands to known slots, closest pairs first. The longer a hand
      // has been unseen, the farther it's allowed to reappear.
      const pairs = [];
      wrists.forEach((w, wi) => {
        slots.forEach((s, si) => {
          if (!s) return;
          pairs.push({
            wi,
            si,
            d: Math.hypot(w.x - s.wrist.x, w.y - s.wrist.y),
            allowed: (MAX_JUMP + (now - s.lastSeen) / 1000) * width,
          });
        });
      });
      pairs.sort((a, b) => a.d - b.d);
      for (const { wi, si, d, allowed } of pairs) {
        if (d > allowed) continue;
        if (ids[wi] !== null || taken.has(si)) continue;
        ids[wi] = si;
        taken.add(si);
      }

      // Unmatched hands take a free slot (empty ones first)
      wrists.forEach((_, wi) => {
        if (ids[wi] !== null) return;
        const free = [0, 1].filter((si) => !taken.has(si));
        const slot = free.find((si) => slots[si] === null) ?? free[0];
        if (slot !== undefined) {
          ids[wi] = slot;
          taken.add(slot);
        }
      });

      wrists.forEach((w, wi) => {
        if (ids[wi] !== null) slots[ids[wi]] = { wrist: w, lastSeen: now };
      });
      return ids;
    },

    // True while the id is alive, including its grace period without being seen
    isActive(id) {
      return slots[id] !== null;
    },
  };
}