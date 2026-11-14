/**
 * Pixel work shared by the capture modes.
 *
 * Kept free of any chrome.* call so it runs in the service worker, in a page,
 * and in the test harness alike — the stitching maths is the riskiest part of
 * full page capture and needs to be exercisable outside the extension.
 */

// Chromium refuses canvases beyond these bounds, and a silent failure would
// look like a corrupted capture rather than a limit being hit.
export const MAX_SIDE = 32767;
export const MAX_AREA = 268435456;

/** Decoded by hand rather than via fetch(): a data: URL round trip through the
 *  network stack is needless work for something already in memory. */
export function dataUrlToBlob(dataUrl) {
  const [meta, encoded] = dataUrl.split(',');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: meta.slice(5).split(';')[0] });
}

export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000; // apply() on the whole array overflows the call stack
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

const toPng = async (canvas) => blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));

/**
 * Crops a capture to a region given in CSS pixels.
 *
 * The scale comes from the capture itself rather than devicePixelRatio: page
 * zoom moves one without moving the other, and the mismatch would show up as a
 * region shifted by a few percent.
 */
export async function cropCapture(dataUrl, rect, viewport) {
  const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
  const scale = bitmap.width / viewport.w;
  const sx = Math.max(0, Math.round(rect.x * scale));
  const sy = Math.max(0, Math.round(rect.y * scale));
  const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(rect.w * scale)));
  const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(rect.h * scale)));

  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();
  return toPng(canvas);
}

/**
 * Joins the scrolled tiles into one image.
 *
 * Each tile is drawn at its own recorded scroll offset, so the last tile —
 * which overlaps the one above it whenever the page height is not a whole
 * number of viewports — simply paints over the duplicated strip. No seam
 * arithmetic, and no gap if a scroll landed slightly short.
 */
export async function stitchTiles(tiles, page) {
  const first = await createImageBitmap(dataUrlToBlob(tiles[0].shot));
  const scale = first.width / page.viewportW;
  const width = first.width;
  const height = Math.round(page.height * scale);

  if (height > MAX_SIDE || width * height > MAX_AREA) {
    first.close();
    throw new Error('err_page_too_large');
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(first, 0, 0);
  first.close();

  for (const tile of tiles.slice(1)) {
    const bitmap = await createImageBitmap(dataUrlToBlob(tile.shot));
    ctx.drawImage(bitmap, 0, Math.round(tile.y * scale));
    bitmap.close();
  }
  return toPng(canvas);
}
