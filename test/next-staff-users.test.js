// Managing staff accounts in the second interface.
//
// The route to delete an account, and every guard around it, already existed;
// the second interface simply never grew the button, so an administrator
// could create a colleague's account and never remove it without going back
// to the old interface.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createStaffUser, listStaff } from '../src/db/queries/staff.js';
import { cleanupDir, makeTestDb, testConfig } from './helpers.js';
import { csrfFrom, encodeFields, login, makeStaffUser } from './staff-helpers.js';

let app; let db; let dir; let session; let me;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  me = await makeStaffUser(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
  session = await login(app);
});

after(async () => { await app.close(); db.close(); cleanupDir(dir); });

const get = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

async function post(url, fields = {}) {
  const page = await get('/staff/users');
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

const colleague = async (username) => {
  const result = await createStaffUser(db, {
    username,
    password: 'a-long-enough-test-password',
    displayName: `Συνάδελφος ${username}`,
    role: 'librarian',
  });
  assert.ok(result.ok, result.reason);
  return result.id;
};

const deleteLinkFor = (body, id) =>
  body.match(new RegExp(`href="/staff/users/${id}/delete"`))?.[0];

describe('deleting a staff account from the second interface', () => {
  it('offers a way to remove a colleague', async () => {
    const id = await colleague('kostas');
    assert.ok(
      deleteLinkFor((await get('/staff/users')).body, id),
      'the page offers no way to delete an account',
    );
  });

  it('explains what will happen before it happens', async () => {
    // Every other destructive action in this interface asks on a page of its
    // own rather than in a dialog, so it reads the same with scripting off.
    const id = await colleague('eleni');
    const page = await get(`/staff/users/${id}/delete`);
    assert.equal(page.statusCode, 200);
    assert.ok(page.body.includes('eleni'), 'the page does not say whose account it is');
    assert.match(
      page.body,
      new RegExp(`<form[^>]*action="/staff/users/${id}/delete"[\\s\\S]*?name="_csrf"`),
      'no guarded form to confirm with',
    );
  });

  it('does not offer to delete the account you are signed in as', async () => {
    const body = (await get('/staff/users')).body;
    assert.equal(
      deleteLinkFor(body, me.id), undefined,
      'the page offers to delete your own account',
    );
  });

  it('refuses to confirm deleting your own account even if you go straight there', async () => {
    const page = await get(`/staff/users/${me.id}/delete`);
    assert.equal(page.statusCode, 302, 'the confirmation page offered to delete you');
  });

  it('actually removes the account', async () => {
    const id = await colleague('giorgos');
    const response = await post(`/staff/users/${id}/delete`);
    assert.equal(response.statusCode, 302);
    assert.ok(!listStaff(db).some((u) => u.id === id), 'the account survived being deleted');
  });

  it('refuses to remove the last administrator', async () => {
    // The guard lives in the query; this proves the control reaches it
    // rather than routing around it.
    const before = listStaff(db).length;
    const response = await post(`/staff/users/${me.id}/delete`);
    assert.equal(response.statusCode, 302);
    assert.equal(listStaff(db).length, before, 'the last administrator was deleted');
  });

  it('does not break the first interface, which deletes from the list', async () => {
    // Classic has its own inline delete and no confirmation page, so the new
    // route must send it back rather than render a template it does not have.
    const id = await colleague('classic-user');
    const page = await app.inject({
      method: 'GET',
      url: `/staff/users/${id}/delete`,
      headers: { cookie: `${session.cookie}; ui=classic` },
    });
    assert.equal(page.statusCode, 302, `classic got ${page.statusCode}, not a redirect`);
    assert.equal(page.headers.location, '/staff/users');
  });
});
