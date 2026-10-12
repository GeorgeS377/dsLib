// Shared test setup.
//
// Every suite gets its own throwaway SQLite file in the OS temp directory, so
// tests never touch data/library.db and can run without interfering with each
// other. The real database is never opened by the test suite.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { loadConfig } from '../src/config.js';

process.env.NODE_ENV = 'test';

let counter = 0;

/**
 * Build a config pointing at a fresh temporary database and upload directory.
 * @param {Record<string, string>} [overrides] Extra env values.
 */
export function testConfig(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dslib-test-${process.pid}-${counter++}-`));
  return {
    config: loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough-32',
      DATABASE_PATH: path.join(dir, 'test.db'),
      UPLOAD_DIR: path.join(dir, 'uploads'),
      LIBRARY_NAME: 'Σχολική Βιβλιοθήκη',
      DEFAULT_LANG: 'el',
      ...overrides,
    }),
    dir,
  };
}

/** Remove a temporary directory created by testConfig. */
export function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Extract the value of one cookie from a set-cookie header list. */
export function cookieValue(response, name) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const entry of list) {
    const [pair] = entry.split(';');
    const index = pair.indexOf('=');
    if (pair.slice(0, index) === name) return decodeURIComponent(pair.slice(index + 1));
  }
  return undefined;
}
