const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const modules = path.join(root, 'node_modules');

// MediaPipe (JS bundle + WASM) -> src/vendor/mediapipe (git-ignored, regenerated)
{
  const from = path.join(modules, '@mediapipe', 'tasks-vision');
  const to = path.join(root, 'src', 'vendor', 'mediapipe');
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  fs.copyFileSync(path.join(from, 'vision_bundle.mjs'), path.join(to, 'vision_bundle.mjs'));
  fs.cpSync(path.join(from, 'wasm'), path.join(to, 'wasm'), { recursive: true });
  console.log('MediaPipe assets copied to', to);
}

// IBM Plex Mono (SIL Open Font License) -> src/assets/fonts (committed)
{
  const from = path.join(modules, '@fontsource', 'ibm-plex-mono');
  const to = path.join(root, 'src', 'assets', 'fonts');
  fs.mkdirSync(to, { recursive: true });
  for (const weight of [400, 700]) {
    const file = `ibm-plex-mono-latin-${weight}-normal.woff2`;
    fs.copyFileSync(path.join(from, 'files', file), path.join(to, file));
  }
  const license = path.join(from, 'LICENSE');
  if (fs.existsSync(license)) {
    fs.copyFileSync(license, path.join(to, 'IBM-Plex-Mono-LICENSE.txt'));
  } else {
    console.warn('Font license file not found: copy it into src/assets/fonts by hand');
  }
  console.log('Fonts copied to', to);
}