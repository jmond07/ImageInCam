export const MAX_SIZE = 600; // longest side of a stored image, in px
export const MAX_STAMPS = 9; // keys 1-9

const DB_NAME = 'imageincam';
const STORE = 'stamps';

// ---------- Saved library (IndexedDB) ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs one request against the store and resolves with its result
async function withStore(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

// ---------- Processing ----------
// Resizes once, off-screen. After this we only draw the small version.
async function processFile(file) {
  const source = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_SIZE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * ratio));
  const height = Math.max(1, Math.round(source.height * ratio));

  const image = new OffscreenCanvas(width, height);
  const octx = image.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(source, 0, 0, width, height);
  source.close();

  return { name: file.name, image, width, height };
}

// Processes files and saves them to the library. Returns the new stamps.
export async function addStamps(files) {
  const added = [];
  for (const file of files) {
    try {
      const stamp = await processFile(file);
      try {
        const blob = await stamp.image.convertToBlob({ type: 'image/png' });
        stamp.id = await withStore('readwrite', (s) =>
          s.add({ name: stamp.name, blob, width: stamp.width, height: stamp.height })
        );
      } catch (err) {
        console.warn(`${file.name} works this session but couldn't be saved:`, err);
      }
      added.push(stamp);
    } catch (err) {
      console.warn(`Could not load ${file.name}:`, err);
    }
  }
  return added;
}

// Reads the saved library (oldest first)
export async function loadSavedStamps() {
  try {
    const records = await withStore('readonly', (s) => s.getAll());
    const stamps = [];
    for (const r of records.slice(0, MAX_STAMPS)) {
      try {
        const image = await createImageBitmap(r.blob);
        stamps.push({ id: r.id, name: r.name, image, width: r.width, height: r.height });
      } catch (err) {
        console.warn(`Could not read saved image ${r.name}:`, err);
      }
    }
    return stamps;
  } catch (err) {
    console.warn('Could not read the saved library:', err);
    return [];
  }
}

export async function deleteSavedStamp(stamp) {
  if (stamp.id === undefined) return;
  try {
    await withStore('readwrite', (s) => s.delete(stamp.id));
  } catch (err) {
    console.warn(`Could not delete ${stamp.name} from the library:`, err);
  }
}

// Draws a stamp, centered and scaled to fit, onto a small canvas
export function drawStampThumb(thumb, stamp) {
  const g = thumb.getContext('2d');
  const k = Math.min(thumb.width / stamp.width, thumb.height / stamp.height);
  const w = stamp.width * k;
  const h = stamp.height * k;
  g.clearRect(0, 0, thumb.width, thumb.height);
  g.drawImage(stamp.image, (thumb.width - w) / 2, (thumb.height - h) / 2, w, h);
}