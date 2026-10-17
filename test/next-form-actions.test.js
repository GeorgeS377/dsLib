// Every form in the second interface posts somewhere that exists.
//
// Two buttons have now been found pointing at routes that were never
// registered — /cover/remove against /cover/delete, and /restore against
// /unarchive. Both looked right in the template and 404'd when pressed, and
// no test could see it because each one only ever checked its own feature.
// This checks the whole interface at once.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';

let app; let db; let dir;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  seedTestCatalogue(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
});

after(async () => { await app.close(); db.close(); cleanupDir(dir); });

/** Every `action="..."` written by a template under src/views/next. */
function formActions() {
  const root = path.join(process.cwd(), 'src', 'views', 'next');
  const found = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.ejs')) continue;

      // EJS expressions go first. A tag like
      //   <form action="/staff/books/<%= book.id %>/restore">
      // contains a '>' inside the expression, so matching the tag before
      // removing them stops halfway through and finds no action at all —
      // which is how a first attempt at this test silently passed.
      // What each expression stands for is an id, and the route cares about
      // the shape, so they all become one parameter.
      const source = fs.readFileSync(full, 'utf8').replace(/<%[-=]?[\s\S]*?%>/g, ':param');

      for (const match of source.matchAll(/<form\b([^>]*)>/g)) {
        const attributes = match[1];
        const action = attributes.match(/\baction="([^"]+)"/)?.[1];
        if (!action) continue;
        // A search box is a GET form and lands on the page it names; only a
        // POST needs a route of its own.
        const method = (attributes.match(/\bmethod="([^"]+)"/)?.[1] ?? 'get').toLowerCase();
        if (method !== 'post') continue;

        const url = action.split('?')[0];
        if (!url.startsWith('/')) continue;
        found.push({ file: path.relative(process.cwd(), full), action, url });
      }
    }
  };

  walk(root);
  return found;
}

describe('every form action in the second interface', () => {
  it('finds some forms to check', () => {
    assert.ok(formActions().length > 5, 'the scan found almost nothing, so it is not working');
  });

  it('names a route that is registered', () => {
    const missing = [];
    for (const { file, action, url } of formActions()) {
      // findRoute matches on the registered pattern, so a concrete id would
      // not match ':id'; the placeholder name does not matter, only the shape.
      const candidates = [url, url.replace(/:param/g, ':id')];
      const known = candidates.some((candidate) => {
        try {
          return Boolean(app.findRoute({ method: 'POST', url: candidate }));
        } catch {
          return false;
        }
      });
      if (!known) missing.push(`${file}: ${action}`);
    }
    assert.deepEqual(missing, [], `forms posting to routes that do not exist:\n${missing.join('\n')}`);
  });
});
