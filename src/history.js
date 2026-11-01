// Undo/redo by snapshots of the scene (positions, sizes and which images exist).
// An "action" is: begin() -> changes -> end()/commit(). The step is only kept if
// something actually changed.

const same = (a, b) =>
  a.length === b.length &&
  a.every((s, i) => s.stamp === b[i].stamp && s.x === b[i].x && s.y === b[i].y && s.width === b[i].width);

export function createHistory(scene, { limit = 30, settleMs = 500 } = {}) {
  const undos = [];
  const redos = [];
  let pending = null; // snapshot from before the current action
  let endedAt = null; // when the last hold ended, so quick re-grabs merge into one step

  function commit() {
    if (!pending) return;
    if (!same(pending, scene.snapshot())) {
      undos.push(pending);
      if (undos.length > limit) undos.shift();
      redos.length = 0;
    }
    pending = null;
    endedAt = null;
  }

  return {
    // Call right BEFORE something starts changing the scene (no-op if one is open)
    begin() {
      if (!pending) pending = scene.snapshot();
      endedAt = null;
    },

    // Call when nothing is being held anymore; the step closes after settleMs
    end(now) {
      if (pending) endedAt = now;
    },

    // Call every frame
    tick(now) {
      if (pending && endedAt !== null && now - endedAt >= settleMs) commit();
    },

    // A one-shot action (delete, clear): closes the previous step, runs, closes its own
    record(action) {
      commit();
      pending = scene.snapshot();
      action();
      commit();
    },

    undo() {
      commit();
      const prev = undos.pop();
      if (!prev) return false;
      redos.push(scene.snapshot());
      scene.restore(prev);
      return true;
    },

    redo() {
      commit();
      const next = redos.pop();
      if (!next) return false;
      undos.push(scene.snapshot());
      scene.restore(next);
      return true;
    },
  };
}