import { FilesetResolver, HandLandmarker } from './vendor/mediapipe/vision_bundle.mjs';
import { createPinchTracker } from './gestures/pinch.js';
import { createHandIds } from './gestures/hand-ids.js';
import { loadStamps, MAX_STAMPS } from './stamps.js';
import { createScene } from './scene.js';
import { createInteraction } from './interaction.js';

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

const allowBtn = document.getElementById('allow-camera');
const cameraError = document.getElementById('camera-error');
const fileInput = document.getElementById('file-input');
const pickBtn = document.getElementById('pick-files');
const fileCount = document.getElementById('file-count');
const startBtn = document.getElementById('start');

const state = {
  step: 'welcome',
  stream: null,
  files: [],
  stamps: [], // resized images ready to use
  selected: 0, // index of the active stamp
  tracker: null,
  trackerStatus: 'Not loaded',
  delegate: '-',
  hands: [], // [{ id, points, label, score, pinch }]
  detectMs: 0,
  fps: 0,
  labVisible: true,
};

const scene = createScene();
const interaction = createInteraction(scene);

// Hands are tracked by stable id (0 or 1), not by MediaPipe's label
const handIds = createHandIds();
const pinchTrackers = [createPinchTracker(), createPinchTracker()];

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
  hud.hidden = step !== 'live';
}

// ---------- Keyboard ----------
window.addEventListener('keydown', (e) => {
  if (state.step === 'welcome') return goTo('camera');
  if (state.step !== 'live') return;

  const key = e.key.toLowerCase();
  if (key === 'l') {
    state.labVisible = !state.labVisible;
  } else if (key === 'c') {
    interaction.releaseAll();
    scene.clear();
  } else if (/^[1-9]$/.test(key)) {
    selectStamp(Number(key) - 1);
  }
});

// ---------- HUD ----------
function drawThumb(thumb, stamp) {
  const g = thumb.getContext('2d');
  const k = Math.min(thumb.width / stamp.width, thumb.height / stamp.height);
  const w = stamp.width * k;
  const h = stamp.height * k;
  g.drawImage(stamp.image, (thumb.width - w) / 2, (thumb.height - h) / 2, w, h);
}

function buildHud() {
  hud.replaceChildren();
  state.stamps.forEach((stamp, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';

    const thumb = document.createElement('canvas');
    thumb.width = thumb.height = 88; // drawn at 2x, shown at 44px
    drawThumb(thumb, stamp);

    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = i + 1;

    slot.append(thumb, key);
    hud.append(slot);
  });
  updateHud();
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
          numHands: 2,
          // Slightly more tolerant than the 0.5 defaults, so fast hands are
          // followed instead of being dropped and re-detected
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
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
  // We detect on the mirrored canvas, so landmarks already match what's on screen
  const result = state.tracker.detectForVideo(canvas, t0);
  state.detectMs = performance.now() - t0;

  // Stable ids from wrist positions (landmark 0)
  const wrists = result.landmarks.map((pts) => ({
    x: pts[0].x * canvas.width,
    y: pts[0].y * canvas.height,
  }));
  const ids = handIds.assign(wrists, canvas.width, t0);

  state.hands = [];
  result.landmarks.forEach((points, i) => {
    const id = ids[i];
    if (id === null) return;
    const category = result.handedness[i]?.[0];
    state.hands.push({
      id,
      points,
      label: fixHandLabel(category?.categoryName),
      score: category?.score ?? 0,
      pinch: pinchTrackers[id].update(points, canvas.width, canvas.height, t0),
    });
  });

  // Ids that expired lose their pinch state
  pinchTrackers.forEach((tracker, id) => {
    if (!handIds.isActive(id)) tracker.reset();
  });

  // Gestures only act once we're in the live view
  if (state.step === 'live') {
    interaction.update(state.hands, canvas, state.stamps[state.selected], t0, (id) =>
      handIds.isActive(id)
    );
  }
}

// ---------- Drawing ----------
const HAND_COLORS = ['#ffd166', '#4cc9f0'];

function drawHands() {
  for (const hand of state.hands) {
    const color = HAND_COLORS[hand.id] ?? '#ffffff';
    const pts = hand.points.map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height }));

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
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
}

function updateLab() {
  lab.hidden = !(state.labVisible && state.step === 'live');
  if (lab.hidden) return;

  const handLines = state.hands.length
    ? state.hands
        .map((h) =>
          h.pinch
            ? `H${h.id + 1} ${h.label.padEnd(5)} ratio ${h.pinch.ratio.toFixed(2)} ${h.pinch.pinching ? 'PINCH' : '-'}`
            : `H${h.id + 1} ${h.label} ?`
        )
        .join('\n')
    : 'no hands';

  lab.textContent =
    `FPS ${state.fps} · detect ${state.detectMs.toFixed(1)} ms · ${state.delegate}\n` +
    `${state.trackerStatus}\n` +
    `${handLines}\n` +
    `Stamp ${state.selected + 1}/${state.stamps.length} · placed ${scene.count}\n` +
    `[L] hide  [C] clear`;
}

// ---------- Main loop ----------
let lastVideoTime = -1;
let frameCount = 0;
let lastFpsTime = performance.now();

function frame(now) {
  // 1. Mirrored video
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  // 2. Detect BEFORE drawing the placed images, so the tracker only sees the camera
  if (state.tracker && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    detect();
  }

  // 3. Placed images, then the skeleton on top (skeleton only while the lab is on)
  if (state.step === 'live') scene.draw(ctx, canvas);
  if (state.labVisible) drawHands();

  frameCount++;
  if (now - lastFpsTime >= 500) {
    state.fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    frameCount = 0;
    lastFpsTime = now;
  }
  updateLab();

  requestAnimationFrame(frame);
}

// ---------- Image picker ----------
pickBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  state.files = [...fileInput.files];
  const n = state.files.length;
  const extra = n > MAX_STAMPS ? ` (first ${MAX_STAMPS} will be used)` : '';
  fileCount.textContent = n ? `${n} image${n === 1 ? '' : 's'} selected${extra}` : '';
  startBtn.disabled = n === 0;
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Loading…';
  state.stamps = await loadStamps(state.files.slice(0, MAX_STAMPS));
  startBtn.textContent = 'Start';

  if (!state.stamps.length) {
    fileCount.textContent = 'Could not read those images. Try other files.';
    return; // stays disabled until new files are picked
  }

  state.selected = 0;
  buildHud();
  goTo('live');
});