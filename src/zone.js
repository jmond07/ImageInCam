const STORAGE_KEY = 'imageincam.zone';
const DEFAULT_RECT = { x: 0.05, y: 0.05, w: 0.9, h: 0.7 }; // fractions of the canvas
const MIN_SIZE = 0.2; // smallest allowed width/height (fraction of the canvas)
const GRAB = 12; // how close (screen px) to an edge or corner counts as grabbing it

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const CURSORS = {
  move: 'move',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

function loadRect() {
  try {
    const r = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const valid =
      r &&
      [r.x, r.y, r.w, r.h].every(Number.isFinite) &&
      r.w >= MIN_SIZE &&
      r.h >= MIN_SIZE &&
      r.x >= 0 &&
      r.y >= 0 &&
      r.x + r.w <= 1.0001 &&
      r.y + r.h <= 1.0001;
    if (valid) return r;
  } catch {
    // no saved zone, or storage unavailable: use the default
  }
  return { ...DEFAULT_RECT };
}

// The "active zone": hands outside it can't start anything. Editable with the mouse.
export function createZone(canvas) {
  let rect = loadRect();
  let editing = false;
  let drag = null; // { mode, start, x, y }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
    } catch {
      // not fatal: the zone just won't be remembered
    }
  }

  // Mouse position -> canvas pixels (the canvas is letterboxed inside its element)
  function toCanvas(e) {
    const box = canvas.getBoundingClientRect();
    const scale = Math.min(box.width / canvas.width, box.height / canvas.height);
    const offX = (box.width - canvas.width * scale) / 2;
    const offY = (box.height - canvas.height * scale) / 2;
    return {
      x: (e.clientX - box.left - offX) / scale,
      y: (e.clientY - box.top - offY) / scale,
      scale,
    };
  }

  // Which part of the rectangle is under the mouse: 'move', an edge/corner, or null
  function hitMode(p) {
    const grab = GRAB / p.scale;
    const x0 = rect.x * canvas.width;
    const x1 = (rect.x + rect.w) * canvas.width;
    const y0 = rect.y * canvas.height;
    const y1 = (rect.y + rect.h) * canvas.height;
    if (p.x < x0 - grab || p.x > x1 + grab || p.y < y0 - grab || p.y > y1 + grab) return null;

    let mode = '';
    if (Math.abs(p.y - y0) <= grab) mode += 'n';
    else if (Math.abs(p.y - y1) <= grab) mode += 's';
    if (Math.abs(p.x - x0) <= grab) mode += 'w';
    else if (Math.abs(p.x - x1) <= grab) mode += 'e';
    if (mode) return mode;
    return p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1 ? 'move' : null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!editing) return;
    const p = toCanvas(e);
    const mode = hitMode(p);
    if (!mode) return;
    drag = { mode, start: { ...rect }, x: p.x, y: p.y };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!editing) return;
    const p = toCanvas(e);
    if (!drag) {
      canvas.style.cursor = CURSORS[hitMode(p)] ?? 'default';
      return;
    }

    const dx = (p.x - drag.x) / canvas.width;
    const dy = (p.y - drag.y) / canvas.height;
    const s = drag.start;

    if (drag.mode === 'move') {
      rect = {
        x: clamp(s.x + dx, 0, 1 - s.w),
        y: clamp(s.y + dy, 0, 1 - s.h),
        w: s.w,
        h: s.h,
      };
    } else {
      let x1 = s.x;
      let y1 = s.y;
      let x2 = s.x + s.w;
      let y2 = s.y + s.h;
      if (drag.mode.includes('w')) x1 = clamp(x1 + dx, 0, x2 - MIN_SIZE);
      if (drag.mode.includes('e')) x2 = clamp(x2 + dx, x1 + MIN_SIZE, 1);
      if (drag.mode.includes('n')) y1 = clamp(y1 + dy, 0, y2 - MIN_SIZE);
      if (drag.mode.includes('s')) y2 = clamp(y2 + dy, y1 + MIN_SIZE, 1);
      rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
  });

  const endDrag = () => {
    if (drag) {
      drag = null;
      save();
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('dblclick', () => {
    if (!editing) return;
    rect = { ...DEFAULT_RECT };
    save();
  });

  return {
    get editing() {
      return editing;
    },

    setEditing(on) {
      editing = on;
      drag = null;
      if (!on) canvas.style.cursor = '';
    },

    // Is this point (canvas px) inside the active zone?
    contains(x, y) {
      return (
        x >= rect.x * canvas.width &&
        x <= (rect.x + rect.w) * canvas.width &&
        y >= rect.y * canvas.height &&
        y <= (rect.y + rect.h) * canvas.height
      );
    },

    // Editor overlay: dims the dead area, shows the rectangle, grid and handles
    draw(ctx) {
      if (!editing) return;
      const x0 = rect.x * canvas.width;
      const y0 = rect.y * canvas.height;
      const w = rect.w * canvas.width;
      const h = rect.h * canvas.height;

      ctx.save();

      // Dim everything outside the rectangle
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(x0, y0, w, h);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fill('evenodd');

      // Grid (thirds)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(x0 + (w * i) / 3, y0);
        ctx.lineTo(x0 + (w * i) / 3, y0 + h);
        ctx.moveTo(x0, y0 + (h * i) / 3);
        ctx.lineTo(x0 + w, y0 + (h * i) / 3);
      }
      ctx.stroke();

      // Outline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(x0, y0, w, h);

      // Handles: corners and edge midpoints
      ctx.fillStyle = '#ffffff';
      const size = 14;
      const xs = [x0, x0 + w / 2, x0 + w];
      const ys = [y0, y0 + h / 2, y0 + h];
      for (const hx of xs) {
        for (const hy of ys) {
          if (hx === xs[1] && hy === ys[1]) continue; // skip the center
          ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
        }
      }

      // Hint
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Spawn zone · drag to move or resize · double-click to reset · Z to finish',
        x0 + w / 2,
        y0 + 30
      );

      ctx.restore();
    },
  };
}