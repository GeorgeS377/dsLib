// Cover image storage, and the crop rectangle that can come with it.
//
// The coordinates arrive in hidden fields written by the cropper, so they are
// untrusted input like any other: these tests pin what happens when they are
// malformed, stale, or describe a rectangle off the edge of the image.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Jimp } from 'jimp';
import { parseCropFields, storeCoverImage } from '../src/lib/upload.js';

let uploadDir;
before(() => { uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dslib-upload-')); });
after(() => { fs.rmSync(uploadDir, { recursive: true, force: true }); });

const jpeg = async ({ width = 800, height = 1200 } = {}) =>
  new Jimp({ width, height, color: 0x3366ccff }).getBuffer('image/jpeg', { quality: 80 });

const store = (buffer, crop) =>
  storeCoverImage(buffer, { uploadDir, maxBytes: 5_000_000, crop });

const stored = async (result) =>
  Jimp.read(path.join(uploadDir, 'covers', result.coverPath));

describe('parseCropFields', () => {
  it('reads four coordinates', () => {
    assert.deepEqual(
      parseCropFields({ crop_x: '10', crop_y: '20', crop_w: '30', crop_h: '45' }),
      { x: 10, y: 20, width: 30, height: 45 },
    );
  });

  it('floors fractional coordinates', () => {
    assert.deepEqual(
      parseCropFields({ crop_x: '10.9', crop_y: '0.4', crop_w: '30.7', crop_h: '45.2' }),
      { x: 10, y: 0, width: 30, height: 45 },
    );
  });

  it('returns null when any coordinate is missing, negative, zero-sized or not a number', () => {
    for (const body of [
      {},
      { crop_x: '0', crop_y: '0', crop_w: '10' },
      { crop_x: '-5', crop_y: '0', crop_w: '10', crop_h: '10' },
      { crop_x: '0', crop_y: '0', crop_w: '0', crop_h: '10' },
      { crop_x: 'abc', crop_y: '0', crop_w: '10', crop_h: '10' },
      { crop_x: '0', crop_y: '0', crop_w: '10', crop_h: 'Infinity' },
    ]) {
      assert.equal(parseCropFields(body), null, JSON.stringify(body));
    }
  });
});

describe('storeCoverImage with a crop', () => {
  it('stores only the cropped rectangle, keeping its proportions', async () => {
    // 400x600 out of 800x1200 is 2:3, and below DISPLAY_MAX_WIDTH, so the
    // stored image is the crop at its own size rather than a resize of it.
    const result = await store(await jpeg(), { x: 100, y: 200, width: 400, height: 600 });
    assert.equal(result.ok, true);
    const image = await stored(result);
    assert.equal(image.width, 400);
    assert.equal(image.height, 600);
  });

  it('clamps a rectangle that hangs over the edge', async () => {
    const result = await store(await jpeg({ width: 400, height: 600 }), {
      x: 300, y: 500, width: 400, height: 400,
    });
    assert.equal(result.ok, true);
    const image = await stored(result);
    assert.equal(image.width, 100);
    assert.equal(image.height, 100);
  });

  it('ignores a rectangle that lies entirely outside the image', async () => {
    const result = await store(await jpeg({ width: 400, height: 600 }), {
      x: 5000, y: 5000, width: 100, height: 100,
    });
    assert.equal(result.ok, true);
    const image = await stored(result);
    assert.equal(image.width, 400, 'the whole image should have been kept');
  });

  it('stores the whole image when no crop is given', async () => {
    const result = await store(await jpeg({ width: 400, height: 600 }));
    assert.equal(result.ok, true);
    const image = await stored(result);
    assert.equal(image.width, 400);
  });

  it('still refuses a non-image even when a crop is given', async () => {
    const result = await store(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
      x: 0, y: 0, width: 10, height: 10,
    });
    assert.deepEqual(result, { ok: false, reason: 'unsupported_type' });
  });
});
