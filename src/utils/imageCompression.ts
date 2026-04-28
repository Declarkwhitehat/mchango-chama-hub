/**
 * Client-side image compression using the Canvas API.
 * Resizes and re-encodes any image as a JPEG so the final file is ≤ MAX_BYTES.
 * Applied universally to every file upload (profile pics, receipts, chama docs, etc.).
 */

const MAX_BYTES = 200 * 1024; // 200 KB
const MAX_DIMENSION = 1920;   // never upscale beyond this on either axis
const MIN_DIMENSION = 320;    // floor so we don't shrink to nothing
const MIN_QUALITY = 0.4;
const START_QUALITY = 0.85;

const IMAGE_MIME_RE = /^image\//i;

export const isImageFile = (file: File): boolean =>
  IMAGE_MIME_RE.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));

const renderToCanvas = (img: HTMLImageElement, width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // White background for transparent PNGs flattened to JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};

/**
 * Compress an image file to ≤ 200 KB by iteratively reducing quality and dimensions.
 * Non-image files are returned untouched. Animated GIFs lose animation (flattened to JPEG).
 */
export async function compressImage(file: File, opts?: { maxBytes?: number }): Promise<File> {
  if (!isImageFile(file)) return file;

  const maxBytes = opts?.maxBytes ?? MAX_BYTES;

  // Skip work if already small enough and is JPEG/PNG (still recompressed if oversized).
  if (file.size <= maxBytes && /jpeg|jpg|png/i.test(file.type)) return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    // Browser cannot decode (e.g. HEIC on some platforms) — fall back to original
    return file;
  }

  // Initial dimensions, capped at MAX_DIMENSION while preserving aspect ratio
  let { width, height } = img;
  const ratio = width / height;
  if (Math.max(width, height) > MAX_DIMENSION) {
    if (width >= height) {
      width = MAX_DIMENSION;
      height = Math.round(MAX_DIMENSION / ratio);
    } else {
      height = MAX_DIMENSION;
      width = Math.round(MAX_DIMENSION * ratio);
    }
  }

  let quality = START_QUALITY;
  let blob: Blob | null = null;

  // Iterate: drop quality first, then dimensions, until under target
  for (let attempt = 0; attempt < 12; attempt++) {
    const canvas = renderToCanvas(img, width, height);
    blob = await canvasToBlob(canvas, quality);
    if (!blob) break;
    if (blob.size <= maxBytes) break;

    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.1);
    } else if (Math.max(width, height) > MIN_DIMENSION) {
      width = Math.max(MIN_DIMENSION, Math.round(width * 0.85));
      height = Math.max(MIN_DIMENSION, Math.round(height * 0.85));
      quality = 0.7; // reset slightly when shrinking
    } else {
      break; // can't reduce further
    }
  }

  if (!blob) return file;

  const newName = file.name.replace(/\.(png|webp|gif|bmp|heic|heif|jpeg|jpg)$/i, '') + '.jpg';
  return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
}

/** Returns a blob URL preview of a (possibly compressed) file. Caller must revoke when done. */
export const createPreviewUrl = (file: File): string => URL.createObjectURL(file);

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
