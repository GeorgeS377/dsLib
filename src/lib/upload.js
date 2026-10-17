// Cover image handling.
//
// Threat model for an image upload, and what answers each part:
//
//   A script disguised as an image   → the bytes are sniffed for a real image
//                                      signature, not trusted by extension or
//                                      by the Content-Type the client claims.
//   An SVG carrying <script>         → SVG is refused outright. It is a
//                                      document format, not a raster image.
//   A decompression bomb             → size is capped before decoding, and
//                                      pixel dimensions are capped after.
//   Metadata leakage (EXIF GPS from  → every image is re-encoded, so the
//   a phone photo of a book cover)      bytes served are never the bytes
//                                      uploaded and no metadata survives.
//   Path traversal via the filename  → the client filename is discarded
//                                      entirely; the stored name is a UUID.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Jimp } from 'jimp';

/** Formats we accept, by their magic bytes. */
const SIGNATURES = [
  { type: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WebP is 'RIFF' .... 'WEBP'; the middle four bytes are the file size.
  {
    type: 'image/webp',
    extension: 'webp',
    bytes: [0x52, 0x49, 0x46, 0x46],
    offsetBytes: { offset: 8, values: [0x57, 0x45, 0x42, 0x50] },
  },
];

/** Longest edge of the stored display image, and of the grid thumbnail. */
export const DISPLAY_MAX_WIDTH = 600;
export const THUMB_MAX_WIDTH = 240;

/** Refuse anything whose decoded dimensions are absurd for a book cover. */
const MAX_PIXELS = 50_000_000;

/**
 * Identify an image from its leading bytes.
 * @param {Buffer} buffer
 * @returns {{ type: string, extension: string } | null}
 */
export function sniffImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  for (const signature of SIGNATURES) {
    const matches = signature.bytes.every((byte, index) => buffer[index] === byte);
    if (!matches) continue;

    if (signature.offsetBytes) {
      const { offset, values } = signature.offsetBytes;
      const tailMatches = values.every((byte, index) => buffer[offset + index] === byte);
      if (!tailMatches) continue;
    }

    return { type: signature.type, extension: signature.extension };
  }
  return null;
}

/**
 * Read a crop rectangle out of submitted form fields.
 *
 * The four values are written by the cropper into hidden inputs, so they are
 * untrusted like anything else off a form. Anything that is not four usable
 * numbers reads as "no crop asked for" rather than as an error — see
 * storeCoverImage for why that is the right answer here.
 *
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
export function parseCropFields(body) {
  const read = (name) => Number(body?.[name]);
  const [x, y, width, height] = ['crop_x', 'crop_y', 'crop_w', 'crop_h'].map(read);

  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return null;

  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

/**
 * Validate and store a cover image, writing a display copy and a thumbnail.
 *
 * @param {Buffer} buffer Raw uploaded bytes.
 * @param {object} options
 * @param {string} options.uploadDir Base upload directory (covers/ is created inside).
 * @param {number} options.maxBytes
 * @param {{ x: number, y: number, width: number, height: number }} [options.crop]
 *   Rectangle in source pixels to keep. Omit to store the whole image.
 * @returns {Promise<{ ok: true, coverPath: string, thumbPath: string } | { ok: false, reason: string }>}
 */
export async function storeCoverImage(buffer, { uploadDir, maxBytes, crop }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }

  // Check the bytes, not the claimed type. An SVG, a PDF, a zip or a script
  // simply does not match any signature here.
  const sniffed = sniffImageType(buffer);
  if (!sniffed) {
    return { ok: false, reason: 'unsupported_type' };
  }

  let image;
  try {
    image = await Jimp.read(buffer);
  } catch {
    // Well-formed header, corrupt body.
    return { ok: false, reason: 'unreadable' };
  }

  if (image.width * image.height > MAX_PIXELS) {
    return { ok: false, reason: 'too_many_pixels' };
  }

  // Keep only the framed rectangle, if one was asked for. A rectangle that
  // overhangs the image is trimmed to it, and one that misses the image
  // entirely is dropped: these coordinates come from a hidden field, and a
  // stale or mangled one should not stand between a librarian and a cover.
  // The whole image is always a defensible thing to store; an error here is
  // not.
  if (crop) {
    const left = Math.min(crop.x, image.width);
    const top = Math.min(crop.y, image.height);
    const w = Math.min(crop.width, image.width - left);
    const h = Math.min(crop.height, image.height - top);
    if (w >= 1 && h >= 1) image.crop({ x: left, y: top, w, h });
  }

  const coversDir = path.join(uploadDir, 'covers');
  await fs.mkdir(coversDir, { recursive: true, mode: 0o750 });

  // The stored name comes from randomUUID, never from the upload. A filename
  // of '../../etc/passwd' or 'x.php' therefore cannot influence where or what
  // we write.
  const id = crypto.randomUUID();
  const coverName = `${id}.jpg`;
  const thumbName = `${id}-thumb.jpg`;

  try {
    // Re-encoding is what strips EXIF (including GPS coordinates from a phone
    // photo) and guarantees the served bytes are ours, not the uploader's.
    const display = image.clone();
    if (display.width > DISPLAY_MAX_WIDTH) {
      display.resize({ w: DISPLAY_MAX_WIDTH });
    }
    await fs.writeFile(
      path.join(coversDir, coverName),
      await display.getBuffer('image/jpeg', { quality: 82 }),
      { mode: 0o640 },
    );

    const thumb = image.clone();
    if (thumb.width > THUMB_MAX_WIDTH) {
      thumb.resize({ w: THUMB_MAX_WIDTH });
    }
    await fs.writeFile(
      path.join(coversDir, thumbName),
      await thumb.getBuffer('image/jpeg', { quality: 78 }),
      { mode: 0o640 },
    );
  } catch (error) {
    // Do not leave half an upload behind.
    await removeCoverFiles(uploadDir, coverName, thumbName);
    return { ok: false, reason: 'write_failed', error };
  }

  return { ok: true, coverPath: coverName, thumbPath: thumbName };
}

/**
 * Read a cover that is waiting out a rejected form.
 *
 * When the server refuses a book form it re-renders with everything that was
 * typed, but a browser will never re-populate a file input — a page could
 * otherwise preload a file off disk and steal it on submit. So the cover is
 * stored at the moment of rejection and only its filenames come back, in
 * hidden fields.
 *
 * Which means these names arrive from a form and are untrusted like anything
 * else off a browser. isSafeStoredName's UUID shape is what stops one naming
 * a file outside covers/; anything else reads as no pending cover at all.
 *
 * @returns {{ coverPath: string, thumbPath: string } | null}
 */
export function pendingCoverFrom(body) {
  const coverPath = body?.pending_cover;
  const thumbPath = body?.pending_thumb;
  if (!isSafeStoredName(coverPath) || !isSafeStoredName(thumbPath)) return null;
  return { coverPath, thumbPath };
}

/**
 * Delete stored cover files. Each name is checked to be a bare filename, so a
 * value that somehow arrived from elsewhere cannot delete outside the covers
 * directory.
 */
export async function removeCoverFiles(uploadDir, ...names) {
  const coversDir = path.join(uploadDir, 'covers');
  for (const name of names) {
    if (!isSafeStoredName(name)) continue;
    try {
      await fs.unlink(path.join(coversDir, name));
    } catch {
      // Already gone, which is the state we wanted.
    }
  }
}

/**
 * A stored cover filename: the UUID form this module writes, and nothing
 * else. Rejects separators, traversal and absolute paths.
 */
export function isSafeStoredName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 100) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-thumb)?\.jpg$/.test(name);
}

// Note: there is no stream-reading helper here. @fastify/multipart is
// registered with attachFieldsToBody: 'keyValues' (see src/app.js), which
// hands the handler a Buffer already capped at limits.fileSize — and, more
// importantly, populates request.body in time for the CSRF preHandler to find
// its token.
