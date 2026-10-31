export const MAX_STAMP_SIZE = 600;
export const MAX_STAMPS = 9;

export async function loadStamps(files) {
  const stamps = [];
  for (const file of files) {
    try {
      stamps.push(await loadStamp(file));
    } catch (err) {
      console.warn(`Could not load ${file.name}:`, err);
    }
  }
  return stamps;
}

async function loadStamp(file) {
  const source = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_STAMP_SIZE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * ratio));
  const height = Math.max(1, Math.round(source.height * ratio));

  // Resize off-screen, once. After this we only draw the small version.
  const image = new OffscreenCanvas(width, height);
  const octx = image.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(source, 0, 0, width, height);
  source.close();

  return { name: file.name, image, width, height };
}