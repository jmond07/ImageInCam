const MAX_ITEMS = 40;
const DEFAULT_WIDTH = 0.18; // image width as a fraction of canvas width
const MIN_WIDTH = 0.04;
const MAX_WIDTH = 0.9;

export function createScene() {
  const items = []; // back to front

  function rectOf(item, canvas) {
    const w = item.width * canvas.width;
    const h = w * (item.stamp.height / item.stamp.width);
    return {
      x: item.x * canvas.width - w / 2,
      y: item.y * canvas.height - h / 2,
      w,
      h,
    };
  }

  return {
    get count() {
      return items.length;
    },

    has(item) {
      return items.includes(item);
    },

    remove(item) {
      const i = items.indexOf(item);
      if (i !== -1) items.splice(i, 1);
    },

    // Rectangle of an image in canvas px: { x, y, w, h }
    rect(item, canvas) {
      return rectOf(item, canvas);
    },

    // Plain copy of the current state, for undo/redo
    snapshot() {
      return items.map((i) => ({ stamp: i.stamp, x: i.x, y: i.y, width: i.width }));
    },

    restore(snap) {
      items.length = 0;
      for (const s of snap) items.push({ ...s, held: false });
    },

    add(stamp, px, py, canvas) {
      const item = {
        stamp,
        x: px / canvas.width,
        y: py / canvas.height,
        width: DEFAULT_WIDTH,
        held: false,
      };
      items.push(item);
      if (items.length > MAX_ITEMS) items.shift();
      return item;
    },

    // Topmost item under a point (in canvas px)
    hitTest(px, py, canvas) {
      for (let i = items.length - 1; i >= 0; i--) {
        const r = rectOf(items[i], canvas);
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return items[i];
      }
      return null;
    },

    moveTo(item, px, py, canvas) {
      item.x = Math.min(1, Math.max(0, px / canvas.width));
      item.y = Math.min(1, Math.max(0, py / canvas.height));
    },

    // Sets the image width as a fraction of the canvas width (clamped)
    setWidth(item, width) {
      item.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
    },

    bringToFront(item) {
      const i = items.indexOf(item);
      if (i !== -1) {
        items.splice(i, 1);
        items.push(item);
      }
    },

    clear() {
      items.length = 0;
    },

    draw(ctx, canvas) {
      for (const item of items) {
        const r = rectOf(item, canvas);
        ctx.drawImage(item.stamp.image, r.x, r.y, r.w, r.h);
        if (item.held) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
        }
      }
    },
  };
}