const MAX_JUMP = 0.3; // max wrist movement between frames, as a fraction of canvas width
const GRACE_MS = 250; // how long an id survives without being seen

// Gives each hand a stable id (0 or 1) by following where its wrist was
// in the previous frame. We don't trust MediaPipe's Left/Right label for this.
export function createHandIds() {
  const slots = [null, null]; // each: { wrist: {x, y}, lastSeen } | null

  return {
    // wrists: [{x, y}] in canvas px. Returns one id per wrist (or null).
    assign(wrists, width, now) {
      slots.forEach((s, i) => {
        if (s && now - s.lastSeen > GRACE_MS) slots[i] = null;
      });

      const ids = new Array(wrists.length).fill(null);
      const taken = new Set();

      // Match hands to known slots, closest pairs first
      const pairs = [];
      wrists.forEach((w, wi) => {
        slots.forEach((s, si) => {
          if (s) pairs.push({ wi, si, d: Math.hypot(w.x - s.wrist.x, w.y - s.wrist.y) });
        });
      });
      pairs.sort((a, b) => a.d - b.d);
      for (const { wi, si, d } of pairs) {
        if (d > MAX_JUMP * width) break;
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