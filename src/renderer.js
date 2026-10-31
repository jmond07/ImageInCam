import { FilesetResolver, HandLandmarker } from './vendor/mediapipe/vision_bundle.mjs';

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
  tracker: null,
  trackerStatus: 'Not loaded',
  delegate: '-',
  hands: [], // [{ points, label, score }]
  detectMs: 0,
  fps: 0,
  labVisible: true,
};

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
}

// Keyboard: any key leaves the welcome screen, L toggles the lab overlay
window.addEventListener('keydown', (e) => {
  if (state.step === 'welcome') goTo('camera');
  else if (e.key.toLowerCase() === 'l') state.labVisible = !state.labVisible;
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
  state.hands = result.landmarks.map((points, i) => ({
    points,
    label: fixHandLabel(result.handedness[i]?.[0]?.categoryName),
    score: result.handedness[i]?.[0]?.score ?? 0,
  }));
}

// ---------- Drawing ----------
const HAND_COLORS = { Left: '#ffd166', Right: '#4cc9f0' };

function drawHands() {
  for (const hand of state.hands) {
    const color = HAND_COLORS[hand.label] ?? '#ffffff';
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
  }
}

function updateLab() {
  lab.hidden = !(state.labVisible && state.step === 'live');
  if (lab.hidden) return;
  const hands = state.hands.length
    ? state.hands.map((h) => `${h.label} ${h.score.toFixed(2)}`).join(' · ')
    : 'none';
  lab.textContent =
    `FPS ${state.fps} · detect ${state.detectMs.toFixed(1)} ms · ${state.delegate}\n` +
    `${state.trackerStatus}\n` +
    `Hands: ${state.hands.length} (${hands})\n` +
    `[L] hide`;
}

// ---------- Main loop ----------
let lastVideoTime = -1;
let frameCount = 0;
let lastFpsTime = performance.now();

function frame(now) {
  // Mirrored video
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  // Only run detection when the camera delivered a new frame
  if (state.tracker && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    detect();
  }

  drawHands();

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
  fileCount.textContent = n ? `${n} image${n === 1 ? '' : 's'} selected` : '';
  startBtn.disabled = n === 0;
});
startBtn.addEventListener('click', () => goTo('live'));