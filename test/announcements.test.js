// Announcements: opening hours, rules, whatever the term brings.
//
// Written by staff and read by everyone, so the two things worth pinning are
// that a visitor sees only what was published, and that nothing a librarian
// types can inject markup into a public page.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  listPublishedAnnouncements,
  moveAnnouncement,
  updateAnnouncement,
} from '../src/db/queries/announcements.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { csrfFrom, encodeFields, login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let session;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  seedTestCatalogue(db);
  await makeStaffUser(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
  session = await login(app);
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

const staffGet = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

async function staffPost(url, fields, { tokenFrom = url } = {}) {
  const page = await staffGet(tokenFrom);
  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: `${session.cookie}; ui=next`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: encodeFields({ _csrf: csrfFrom(page.body), ...fields }),
  });
}

describe('keeping announcements', () => {
  it('stores one and reads it back', () => {
    const result = createAnnouncement(db, {
      title: 'Ωράριο λειτουργίας',
      body: 'Δευτέρα–Παρασκευή, 08:30–14:00.',
    });
    assert.ok(result.ok, 'not created');

    const all = listAnnouncements(db);
    assert.equal(all[0].title, 'Ωράριο λειτουργίας');
    assert.equal(all[0].is_published, 1, 'a new announcement should be visible by default');
  });

  it('refuses one with no title', () => {
    const result = createAnnouncement(db, { title: '   ', body: 'κάτι' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'required');
  });

  it('keeps an unpublished one off the public page', () => {
    const draft = createAnnouncement(db, { title: 'Πρόχειρο', body: 'όχι ακόμη' });
    updateAnnouncement(db, draft.id, { isPublished: false });

    assert.ok(
      listAnnouncements(db).some((item) => item.id === draft.id),
      'staff cannot see their own draft',
    );
    assert.ok(
      !listPublishedAnnouncements(db).some((item) => item.id === draft.id),
      'a draft reached the public list',
    );
  });

  it('puts the newest first and lets staff reorder', () => {
    const first = createAnnouncement(db, { title: 'Πρώτη' });
    const second = createAnnouncement(db, { title: 'Δεύτερη' });

    const before = listAnnouncements(db).map((item) => item.id);
    assert.ok(before.indexOf(second.id) < before.indexOf(first.id), 'newest is not first');

    moveAnnouncement(db, first.id, 'up');
    const after = listAnnouncements(db).map((item) => item.id);
    assert.ok(after.indexOf(first.id) < after.indexOf(second.id), 'the move did nothing');
  });

  it('moves nothing past the ends', () => {
    const ids = listAnnouncements(db).map((item) => item.id);
    moveAnnouncement(db, ids[0], 'up');
    assert.deepEqual(listAnnouncements(db).map((item) => item.id), ids, 'the top one moved up');

    moveAnnouncement(db, ids[ids.length - 1], 'down');
    assert.deepEqual(listAnnouncements(db).map((item) => item.id), ids, 'the last one moved down');
  });

  it('keeps a link and how it should open', () => {
    const item = createAnnouncement(db, {
      title: 'Κανονισμός',
      linkUrl: 'https://example.gr/kanonismos.pdf',
      linkNewTab: true,
    });
    const stored = listAnnouncements(db).find((row) => row.id === item.id);
    assert.equal(stored.link_url, 'https://example.gr/kanonismos.pdf');
    assert.equal(stored.link_new_tab, 1);
  });

  it('refuses a link that is not http', () => {
    // A notice is written by staff, but "javascript:" in a link on the front
    // page is not a notice.
    for (const hostile of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      const result = createAnnouncement(db, { title: 'Κακός σύνδεσμος', linkUrl: hostile });
      assert.equal(result.ok, false, `${hostile} was accepted`);
      assert.equal(result.reason, 'invalid_link');
    }
  });

  it('deletes one', () => {
    const doomed = createAnnouncement(db, { title: 'Προσωρινή' });
    deleteAnnouncement(db, doomed.id);
    assert.ok(!listAnnouncements(db).some((item) => item.id === doomed.id));
  });
});

describe('the announcements page', () => {
  it('is reachable from the settings page', async () => {
    const response = await staffGet('/staff/settings');
    assert.ok(response.body.includes('/staff/announcements'), 'no way to reach them');
  });

  it('creates one through the form', async () => {
    const response = await staffPost('/staff/announcements', {
      title: 'Κλειστά την Παρασκευή',
      body: 'Η βιβλιοθήκη θα είναι κλειστή στις 20/10.',
    });
    assert.equal(response.statusCode, 302);
    assert.ok(listAnnouncements(db).some((item) => item.title === 'Κλειστά την Παρασκευή'));
  });

  it('is refused to a signed-out visitor', async () => {
    const response = await app.inject({ method: 'GET', url: '/staff/announcements' });
    assert.equal(response.statusCode, 302);
    assert.ok(response.headers.location.startsWith('/staff/login'));
  });
});

// Its own database and app: these tests care about what the whole table
// contains, and top-level describes run concurrently against a shared one.
describe('announcements on the front page', () => {
  let ownApp;
  let ownDb;
  let ownDir;

  before(async () => {
    const setup = testConfig();
    ownDir = setup.dir;
    ownDb = makeTestDb();
    seedTestCatalogue(ownDb);
    ownApp = await buildApp({ config: setup.config, logger: false, db: ownDb });
    await ownApp.ready();
  });

  after(async () => {
    await ownApp.close();
    ownDb.close();
    cleanupDir(ownDir);
  });

  const front = () =>
    ownApp.inject({ method: 'GET', url: '/', headers: { cookie: 'ui=next' } });

  it('shows no panel at all when there is nothing to say', async () => {
    const response = await front();
    assert.equal(response.statusCode, 200);
    assert.ok(!response.body.includes('announce'), 'an empty panel was rendered');
  });

  it('shows the published ones and not the drafts', async () => {
    createAnnouncement(ownDb, { title: 'Κλειστά την Παρασκευή', body: 'Στις 20/10.' });
    const draft = createAnnouncement(ownDb, { title: 'Πρόχειρο' });
    updateAnnouncement(ownDb, draft.id, { isPublished: false });

    const response = await front();
    assert.ok(response.body.includes('Κλειστά την Παρασκευή'), 'the announcement is missing');
    assert.ok(!response.body.includes('Πρόχειρο'), 'an unpublished one is public');
  });

  it('escapes what a librarian typed', async () => {
    // A librarian is trusted to write the library's notices, not to inject
    // markup into every visitor's page.
    createAnnouncement(ownDb, {
      title: '<script>alert(1)</script>',
      body: '<img src=x onerror=alert(2)>',
    });
    const response = await front();
    // What must not appear is a tag. The words inside one survive escaping
    // unchanged, so asserting on them would fail on correct output.
    assert.ok(!response.body.includes('<script>alert(1)'), 'a script tag went through');
    assert.ok(!response.body.includes('<img src=x'), 'an image tag went through');
    assert.ok(response.body.includes('&lt;script&gt;'), 'the title was not shown at all');
    assert.ok(response.body.includes('&lt;img src=x'), 'the body was not shown at all');
  });
});
