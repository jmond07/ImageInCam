const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'node_modules', '@mediapipe', 'tasks-vision');
const to = path.join(__dirname, '..', 'src', 'vendor', 'mediapipe');

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
fs.copyFileSync(path.join(from, 'vision_bundle.mjs'), path.join(to, 'vision_bundle.mjs'));
fs.cpSync(path.join(from, 'wasm'), path.join(to, 'wasm'), { recursive: true });

console.log('MediaPipe assets copied to', to);