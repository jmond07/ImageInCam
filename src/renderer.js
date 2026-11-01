import { FilesetResolver, HandLandmarker } from './vendor/mediapipe/vision_bundle.mjs';
import { createPinchTracker } from './gestures/pinch.js';
import { createHandIds } from './gestures/hand-ids.js';
import { measureHand } from './gestures/hand-shape.js';
import { createMotionTracker } from './gestures/motion.js';
import { createClearGesture } from './gestures/clear-gesture.js';
import { createDeleteGesture } from './gestures/delete-gesture.js';
import {
  addStamps,
  loadSavedStamps,
  deleteSavedStamp,
  drawStampThumb,
  MAX_STAMPS,
} from './stamps.js';
import { createScene } from './scene.js';
import { createInteraction } from './interaction.js';
import { createZone } from './zone.js';
import { createHistory } from './history.js';
import { createMenu } from './menu.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings.js';
import { theme } from './theme.js';

const WASM_PATH = new URL('./vendor/mediapipe/wasm', document.baseURI).href;
const MODEL_PATH = new URL('./assets/hand_landmarker.task', document.baseURI).href;

const screens = {
  welcome: document.getElementById('welcome'),
  camera: document.getElementById('camera-step'),
  upload: document.getElementById('upload-step'),
};
const video = document.getElementById('cam');
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const lab = document.getElementById('lab');
const hud = document.getElementById('hud');
const badge = document.getElementById('badge');
const menuBtn = document.getElementById('menu-btn');
const addInput = document.getElementById('add-input');
const quitModal = document.getElementById('quit-modal');
const quitStay = document.getElementById('quit-stay');
const quitConfirm = document.getElementById('quit-confirm');

const allowBtn = document.getElementById('allow-camera');
const cameraError = document.getElementById('camera-error');
const fileInput = document.getElementById('file-input');
const pickBtn = document.getElementById('pick-files');
const fileCount = document.getElementById('file-count');
const startBtn = document.getElementById('start');

// Detection runs on its own small copy of the camera frame
const DETECT_W = 640;
const DETECT_H = 360;
const detectCanvas = document.createElement('canvas');
detectCanvas.width = DETECT_W;
detectCanvas.height = DETECT_H;
const detectCtx = detectCanvas.getContext('2d');

// Persistent settings (hands in use, mirror, debug overlay)
const settings = loadSettings();

const state = {
  step: 'welcome',
  stream: null,
  files: [], // files picked in the start screen, not yet added to the library
  stamps: [], // the library: resized images ready to use (max 9)
  selected: 0, // index of the active stamp
  tracker: null,
  trackerStatus: 'Not loaded',
  delegate: '-',
  hands: [], // [{ id, points, label, score, shape, motion, pinch, active }]
  detectMs: 0,
  fps: 0,
  paused: false,
  imagesHidden: false,
  quitOpen: false,
  clearProgress: 0,
  clearAnchor: null,
  deleting: { item: null, progress: 0 },
  events: [], // last gesture events, shown in the lab and logged to the console
};

// Gesture event log: lab overlay + DevTools console (so you can copy it)
const appStart = performance.now();
function logEvent(message) {
  const line = `${((performance.now() - appStart) / 1000).toFixed(1)}s ${message}`;
  state.events.push(line);
  if (state.events.length > 6) state.events.shift();
  console.log(line);
}

const scene = createScene();
const history = createHistory(scene);
const interaction = createInteraction(scene, logEvent, history);
const clearGesture = createClearGesture();
const deleteGesture = createDeleteGesture();
const zone = createZone(canvas);

// Hands are tracked by stable id (0 or 1), not by MediaPipe's label
const handIds = createHandIds();
const pinchTrackers = [createPinchTracker(), createPinchTracker()];
const motionTrackers = [createMotionTracker(), createMotionTracker()];

// MediaPipe's handedness comes out inverted in our setup (tested: raising the
// left hand reports "Right"). Only used for display now, since it also flips
// when the hand is tilted or moving fast.
function fixHandLabel(name) {
  if (name === 'Left') return 'Right';
  if (name === 'Right') return 'Left';
  return '?';
}

// Shows one screen; 'live' matches none, so the canvas is revealed.
function goTo(step) {
  state.step = step;
  for (const [name, el] of Object.entries(screens)) {
    el.classList.toggle('active', name === step);
  }
  syncHudVisibility();
  menuBtn.hidden = step !== 'live';
  if (step !== 'live') menu.close();
  // Closing the window only asks for confirmation while the live view is open
  window.api?.setConfirmClose(step === 'live');
}

// ---------- Tracking state ----------
function resetGestureProgress() {
  state.clearProgress = 0;
  state.clearAnchor = null;
  state.deleting = { item: null, progress: 0 };
  deleteGesture.reset();
}

function resetTracking() {
  state.hands = [];
  resetGestureProgress();
  handIds.reset();
  pinchTrackers.forEach((t) => t.reset());
  motionTrackers.forEach((t) => t.reset());
}

// ---------- Badge (paused / hidden) ----------
function updateBadge() {
  const parts = [];
  if (state.paused) parts.push('Tracking paused · P to resume');
  if (state.imagesHidden) parts.push('Images hidden · H to show');
  badge.textContent = parts.join('  |  ');
  badge.hidden = parts.length === 0;
}

function togglePause() {
  state.paused = !state.paused;
  updateBadge();
  if (state.paused) {
    interaction.releaseAll(); // let go of whatever was held; placed images stay
    resetTracking();
    logEvent('PAUSED');
  } else {
    logEvent('RESUMED');
  }
}

// Hides all placed images without touching them; they come back in the same place
function toggleHidden() {
  state.imagesHidden = !state.imagesHidden;
  if (state.imagesHidden) {
    interaction.releaseAll();
    resetGestureProgress();
  }
  updateBadge();
  logEvent(state.imagesHidden ? 'IMAGES hidden' : 'IMAGES shown');
}

// ---------- Active zone editor ----------
function toggleZoneEditor() {
  const on = !zone.editing;
  zone.setEditing(on);
  if (on) {
    menu.close(); // so the menu doesn't cover the canvas
    interaction.releaseAll(); // gestures are off while editing
    resetGestureProgress();
  }
  logEvent(on ? 'ZONE editing' : 'ZONE saved');
}

// ---------- Settings ----------
function toggleLab() {
  settings.lab = !settings.lab;
  saveSettings(settings);
}

function toggleSkeleton() {
  settings.skeleton = !settings.skeleton;
  saveSettings(settings);
}

function toggleMirror() {
  settings.mirror = !settings.mirror;
  saveSettings(settings);
  interaction.releaseAll();
  resetTracking();
  logEvent(`MIRROR ${settings.mirror ? 'on' : 'off'}`);
}

// Pushes settings.hands into the tracker (rebuilds it if it can't be changed live)
async function applyHands() {
  if (!state.tracker) return; // loadTracker will read settings.hands when it's ready
  try {
    await state.tracker.setOptions({ numHands: settings.hands });
  } catch (err) {
    console.warn('setOptions failed, rebuilding the tracker:', err);
    state.tracker.close?.();
    state.tracker = null;
    await loadTracker();
  }
}

async function setHands(n) {
  settings.hands = n;
  saveSettings(settings);
  interaction.releaseAll();
  resetTracking();
  logEvent(`HANDS ${n}`);
  await applyHands();
}

async function resetSettings() {
  const mirrorChanged = settings.mirror !== DEFAULT_SETTINGS.mirror;
  Object.assign(settings, DEFAULT_SETTINGS);
  saveSettings(settings);
  zone.reset();
  interaction.releaseAll();
  if (mirrorChanged) resetTracking();
  logEvent('SETTINGS reset');
  await applyHands();
}

// ---------- Undo / redo / clear ----------
// While images are hidden these would change things you can't see
function imagesVisible() {
  if (state.imagesHidden) logEvent('Images are hidden: press H to show them first');
  return !state.imagesHidden;
}

function undoLast() {
  if (!imagesVisible()) return;
  interaction.releaseAll(); // let go of anything held first
  resetGestureProgress();
  logEvent(history.undo() ? 'UNDO' : 'UNDO (nothing to undo)');
}

function redoLast() {
  if (!imagesVisible()) return;
  interaction.releaseAll();
  resetGestureProgress();
  logEvent(history.redo() ? 'REDO' : 'REDO (nothing to redo)');
}

function clearAll(reason) {
  if (!imagesVisible()) return;
  history.record(() => {
    interaction.releaseAll();
    scene.clear();
  });
  logEvent(`CLEAR (${reason})`);
}

// ---------- Quit confirmation ----------
function showQuitConfirm() {
  if (state.step !== 'live') {
    window.api?.quit(); // nothing to lose outside the live view
    return;
  }
  interaction.releaseAll();
  resetGestureProgress();
  menu.close();
  state.quitOpen = true;
  quitModal.hidden = false;
  quitStay.focus();
}

function hideQuitConfirm() {
  state.quitOpen = false;
  quitModal.hidden = true;
}

quitStay.addEventListener('click', hideQuitConfirm);
quitConfirm.addEventListener('click', () => window.api?.quit());
window.api?.onCloseRequested(showQuitConfirm);

// ---------- Menu ----------
function getMenuView() {
  return {
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
    hasImages: scene.count > 0,
    libraryFull: state.stamps.length >= MAX_STAMPS,
    hidden: state.imagesHidden,
    paused: state.paused,
    zoneEditing: zone.editing,
    hands: settings.hands,
    mirror: settings.mirror,
    skeleton: settings.skeleton,
    lab: settings.lab,
  };
}

const menu = createMenu(
  {
    undo: undoLast,
    redo: redoLast,
    toggleHidden,
    clearAll: () => clearAll('menu'),
    addImages: () => addInput.click(),
    togglePause,
    toggleZone: toggleZoneEditor,
    hands1: () => setHands(1),
    hands2: () => setHands(2),
    toggleMirror,
    toggleSkeleton,
    toggleLab,
    resetSettings,
  },
  getMenuView
);

// ---------- Keyboard and mouse ----------
window.addEventListener('keydown', (e) => {
  if (state.step === 'welcome') return goTo('camera');

  // While the quit dialog is open, only Esc does anything (buttons work natively)
  if (state.quitOpen) {
    if (e.key === 'Escape') hideQuitConfirm();
    return;
  }
  if (state.step !== 'live') return;

  const key = e.key.toLowerCase();

  // Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo
  if (e.ctrlKey || e.metaKey) {
    if (key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoLast();
      else undoLast();
    } else if (key === 'y') {
      e.preventDefault();
      redoLast();
    }
    return;
  }

  if (key === 'l') toggleLab();
  else if (key === 's') toggleSkeleton();
  else if (key === 'c') clearAll('key C');
  else if (key === 'p') togglePause();
  else if (key === 'h') toggleHidden();
  else if (key === 'z') toggleZoneEditor();
  else if (key === 'm') menu.toggle();
  else if (key === 'escape') menu.close();
  else if (/^[1-9]$/.test(key)) selectStamp(Number(key) - 1);
});

// Mouse wheel resizes whatever is being held (handy in 1-hand mode)
canvas.addEventListener(
  'wheel',
  (e) => {
    if (state.step !== 'live' || state.imagesHidden || state.quitOpen) return;
    e.preventDefault();
    interaction.scaleHeld(e.deltaY < 0 ? 1.08 : 1 / 1.08);
  },
  { passive: false }
);

// ---------- HUD ----------
function syncHudVisibility() {
  hud.hidden = state.step !== 'live' || state.stamps.length === 0;
}

function buildHud() {
  hud.replaceChildren();
  state.stamps.forEach((stamp, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.title = stamp.name;
    slot.addEventListener('click', () => selectStamp(i));

    const thumb = document.createElement('canvas');
    thumb.width = thumb.height = 88; // drawn at 2x, shown at 44px
    drawStampThumb(thumb, stamp);

    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = i + 1;

    slot.append(thumb, key);
    hud.append(slot);
  });
  updateHud();
  syncHudVisibility();
}

function updateHud() {
  [...hud.children].forEach((slot, i) => {
    slot.classList.toggle('selected', i === state.selected);
  });
}

function selectStamp(index) {
  if (index < state.stamps.length) {
    state.selected = index;
    updateHud();
  }
}

// ---------- Library (saved images) ----------
// What the start screen says about saved and newly picked images
function refreshPickerText() {
  const saved = state.stamps.length;
  const picked = state.files.length;
  const room = Math.max(0, MAX_STAMPS - saved);

  const parts = [];
  if (saved) parts.push(`${saved} saved`);
  if (picked) {
    parts.push(`${picked} new selected${picked > room ? ` (only ${room} will fit)` : ''}`);
  }
  fileCount.textContent = parts.join(' · ');
  startBtn.disabled = saved + Math.min(picked, room) === 0;
}

// Redraws everything that shows the library
function refreshLibraryUi() {
  state.selected = Math.min(state.selected, Math.max(0, state.stamps.length - 1));
  buildHud();
  menu.renderLibrary(state.stamps, removeStamp);
  refreshPickerText();
}

// Adds files to the library (resized and saved), up to MAX_STAMPS in total
async function addFiles(files) {
  const list = [...files];
  if (!list.length) return;

  const room = MAX_STAMPS - state.stamps.length;
  if (room <= 0) {
    logEvent(`LIBRARY full (max ${MAX_STAMPS})`);
    return;
  }
  const added = await addStamps(list.slice(0, room));
  state.stamps.push(...added);
  refreshLibraryUi();
  logEvent(`LIBRARY +${added.length}`);
}

// Removes a saved image. Copies already placed on screen stay.
async function removeStamp(stamp) {
  await deleteSavedStamp(stamp);
  state.stamps = state.stamps.filter((s) => s !== stamp);
  refreshLibraryUi();
  logEvent(`LIBRARY removed ${stamp.name}`);
}

addInput.addEventListener('change', async () => {
  await addFiles(addInput.files);
  addInput.value = '';
});

// Load the saved library as soon as the app opens
const libraryLoading = loadSavedStamps().then((saved) => {
  state.stamps = saved;
  refreshLibraryUi();
});

// ---------- Camera ----------
function cameraErrorMessage(err) {
  switch (err.name) {
    case 'NotAllowedError':
      return 'Camera access is blocked. In Windows Settings → Privacy & security → Camera, allow desktop apps.';
    case 'NotFoundError':
      return 'No camera found. Plug one in and try again.';
    case 'NotReadableError':
      return 'Your camera is being used by another app. Close it and try again.';
    default:
      return `Could not start the camera (${err.name}).`;
  }
}

async function startCamera() {
  allowBtn.disabled = true;
  cameraError.hidden = true;
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    video.srcObject = state.stream;
    await video.play();
    requestAnimationFrame(frame);
    goTo('upload');
    loadTracker(); // loads in the background while the user picks images
  } catch (err) {
    cameraError.textContent = cameraErrorMessage(err);
    cameraError.hidden = false;
    allowBtn.disabled = false;
    allowBtn.textContent = 'Try again';
  }
}
allowBtn.addEventListener('click', startCamera);

// Draws the camera onto a canvas, mirrored or not depending on the setting
function drawVideo(context, w, h) {
  if (settings.mirror) {
    context.save();
    context.scale(-1, 1);
    context.drawImage(video, -w, 0, w, h);
    context.restore();
  } else {
    context.drawImage(video, 0, 0, w, h);
  }
}

// ---------- Hand tracking ----------
async function loadTracker() {
  state.trackerStatus = 'Loading hand tracking…';
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    for (const delegate of ['GPU', 'CPU']) {
      try {
        state.tracker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          runningMode: 'VIDEO',
          numHands: settings.hands,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        state.delegate = delegate;
        state.trackerStatus = 'Tracking ready';
        return;
      } catch (err) {
        console.warn(`HandLandmarker failed with ${delegate}:`, err);
      }
    }
    state.trackerStatus = 'Hand tracking failed (see console)';
  } catch (err) {
    console.error(err);
    state.trackerStatus = 'Hand tracking failed (see console)';
  }
}

function detect() {
  const t0 = performance.now();

  // Small copy of the camera frame (mirrored like the big one): much cheaper than
  // 1280x720, and landmarks are normalized so they still map onto the big canvas
  drawVideo(detectCtx, DETECT_W, DETECT_H);

  const result = state.tracker.detectForVideo(detectCanvas, t0);
  state.detectMs = performance.now() - t0;

  // Stable ids from wrist positions (landmark 0)
  const wrists = result.landmarks.map((pts) => ({
    x: pts[0].x * canvas.width,
    y: pts[0].y * canvas.height,
  }));
  const ids = handIds.assign(wrists, canvas.width, t0, (id) => interaction.isHolding(id));

  state.hands = [];
  result.landmarks.forEach((points, i) => {
    const id = ids[i];
    if (id === null) return;
    const category = result.handedness[i]?.[0];
    const shape = measureHand(points, canvas.width, canvas.height);
    state.hands.push({
      id,
      points,
      label: fixHandLabel(category?.categoryName),
      score: category?.score ?? 0,
      shape,
      active: zone.contains(shape.palmX, shape.palmY), // inside the spawn zone?
      motion: motionTrackers[id].update(shape, t0),
      pinch: pinchTrackers[id].update(points, canvas.width, canvas.height, t0),
    });
  });

  // Ids that expired lose their state
  pinchTrackers.forEach((tracker, id) => {
    if (!handIds.isActive(id)) {
      tracker.reset();
      motionTrackers[id].reset();
    }
  });

  // Gestures only act in the live view, with images visible, and not while a dialog
  // or the zone editor is open
  const gesturesOn = state.step === 'live' && !zone.editing && !state.imagesHidden && !state.quitOpen;
  if (gesturesOn) {
    interaction.update(state.hands, canvas, state.stamps[state.selected], t0, (id) =>
      handIds.isActive(id)
    );

    const clear = clearGesture.update(state.hands, interaction.holdingAny(), scene.count > 0, t0);
    state.clearProgress = clear.progress;
    state.clearAnchor = clear.anchor;
    if (clear.triggered) clearAll('two open hands');

    const del = deleteGesture.update(state.hands, scene, canvas, interaction.holdingAny(), t0);
    state.deleting = del;
    if (del.triggered) {
      history.record(() => scene.remove(del.item));
      logEvent('DELETE (pointed image)');
    }
  }
}

// ---------- Drawing ----------
const HAND_COLORS = [theme.accent, theme.text];

function drawHands() {
  for (const hand of state.hands) {
    const color = HAND_COLORS[hand.id] ?? theme.text;
    const pts = hand.points.map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height }));

    // Hands outside the spawn zone (and not holding anything) are drawn faded
    const faded = !hand.active && !interaction.isHolding(hand.id);
    ctx.save();
    ctx.globalAlpha = faded ? 0.5 : 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(pts[start].x, pts[start].y);
      ctx.lineTo(pts[end].x, pts[end].y);
      ctx.stroke();
    }

    ctx.fillStyle = color;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pinch marker: ring while open, filled disc while pinching
    if (hand.pinch) {
      const { x, y, pinching } = hand.pinch;
      ctx.beginPath();
      ctx.arc(x, y, pinching ? 16 : 10, 0, Math.PI * 2);
      if (pinching) {
        ctx.fillStyle = theme.text;
        ctx.fill();
      } else {
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Resize clutch marker (thumb + middle finger touching)
    if (hand.pinch?.clutch) {
      const mx = (pts[4].x + pts[12].x) / 2;
      const my = (pts[4].y + pts[12].y) / 2;
      ctx.beginPath();
      ctx.arc(mx, my, 16, 0, Math.PI * 2);
      ctx.fillStyle = theme.text;
      ctx.fill();
      ctx.fillStyle = theme.bg;
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↕', mx, my + 1);
    }

    ctx.restore();
  }
}

// Draws a circular progress ring with a label under it
function drawProgressRing(x, y, progress, label) {
  const r = 36;
  ctx.save();
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = theme.track;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = theme.text;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + r + 22);
  ctx.restore();
}

// Progress for the "clear all" gesture (drawn even when the lab is hidden)
function drawClearProgress() {
  if (state.clearProgress <= 0 || !state.clearAnchor) return;
  drawProgressRing(state.clearAnchor.x, state.clearAnchor.y, state.clearProgress, 'Clearing…');
}

// Progress for the "delete one image" gesture: dashed outline + ring on the image
function drawDeleteProgress() {
  const { item, progress } = state.deleting;
  if (!item || progress <= 0) return;
  const r = scene.rect(item, canvas);

  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();

  drawProgressRing(r.x + r.w / 2, r.y + r.h / 2, progress, 'Deleting…');
}

function updateLab() {
  lab.hidden = !(settings.lab && state.step === 'live');
  if (lab.hidden) return;

  const handLines = state.hands.length
    ? state.hands
        .map((h) => {
          if (!h.pinch) return `H${h.id + 1} ${h.label} ?`;
          const mode = h.pinch.pinching
            ? 'PINCH '
            : h.pinch.clutch
              ? 'CLUTCH'
              : h.shape.pointing
                ? 'POINT '
                : '-     ';
          const reach = h.shape.reach.map((r) => r.toFixed(1)).join('/');
          const flags = [!h.active && 'OUT', h.shape.partial && 'EDGE'].filter(Boolean).join(' ');
          return `H${h.id + 1} ${h.label.padEnd(5)} r ${h.pinch.ratio.toFixed(2)} ${mode} reach ${reach} v${h.motion.speed.toFixed(1)} ${flags}`;
        })
        .join('\n')
    : state.paused
      ? 'paused'
      : 'no hands';

  const size =
    interaction.resizeWidth !== null ? ` · resizing ${(interaction.resizeWidth * 100).toFixed(0)}%` : '';

  lab.textContent =
    `FPS ${state.fps} · detect ${state.detectMs.toFixed(1)} ms · ${state.delegate} · ${settings.hands} hand${settings.hands === 1 ? '' : 's'}\n` +
    `${state.trackerStatus}\n` +
    `${handLines}\n` +
    `Stamp ${state.selected + 1}/${state.stamps.length} · placed ${scene.count}${size}\n` +
    `[L] debug [S] hands [C] clear [P] pause [Z] zone [H] hide [M] menu\n` +
    `--- events ---\n` +
    (state.events.length ? state.events.join('\n') : '(none yet)');
}

// ---------- Main loop ----------
let lastVideoTime = -1;
let frameCount = 0;
let lastFpsTime = performance.now();
let lastMenuSync = 0;

function frame(now) {
  // 1. Camera video
  drawVideo(ctx, canvas.width, canvas.height);

  // 2. Detect when the camera delivered a new frame (it uses its own small canvas)
  if (state.tracker && !state.paused && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    detect();
  }

  // 3. Placed images, then the skeleton on top (skeleton only while the lab is on)
  if (state.step === 'live' && !state.imagesHidden) scene.draw(ctx, canvas);
  if (settings.skeleton) drawHands();
  drawClearProgress();
  drawDeleteProgress();
  zone.draw(ctx); // only draws while the zone is being edited
  history.tick(performance.now());

  frameCount++;
  if (now - lastFpsTime >= 500) {
    state.fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    frameCount = 0;
    lastFpsTime = now;
  }
  updateLab();

  // Keep the menu in line with the app while it's open (also reflects keyboard shortcuts)
  if (menu.isOpen && now - lastMenuSync > 250) {
    lastMenuSync = now;
    menu.sync();
  }

  requestAnimationFrame(frame);
}

// ---------- Start screen: picking images ----------
pickBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  state.files = [...fileInput.files];
  refreshPickerText();
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Loading…';

  await libraryLoading; // the saved library must be in before we add to it
  await addFiles(state.files);
  state.files = [];
  fileInput.value = '';
  startBtn.textContent = 'Start';

  if (!state.stamps.length) {
    fileCount.textContent = 'Could not read those images. Try other files.';
    return; // stays disabled until new files are picked
  }

  state.selected = 0;
  buildHud();
  goTo('live');
});