// Password hashing and the account lockout counter.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MIN_PASSWORD_LENGTH,
  checkPasswordStrength,
  hashPassword,
  needsRehash,
  verifyPassword,
  verifyPasswordDummy,
} from '../src/lib/password.js';
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  createStaffUser,
  getStaffByUsername,
  lockoutState,
  recordFailedLogin,
  recordSuccessfulLogin,
  updateStaffUser,
} from '../src/db/queries/staff.js';
import { makeTestDb } from './helpers.js';

const GOOD_PASSWORD = 'correct-horse-battery-staple';

describe('password hashing', () => {
  it('produces a self-describing hash that contains no plaintext', async () => {
    const hash = await hashPassword(GOOD_PASSWORD);
    assert.match(hash, /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.ok(!hash.includes(GOOD_PASSWORD));
    assert.ok(!hash.toLowerCase().includes('horse'));
  });

  it('salts each hash, so identical passwords hash differently', async () => {
    const [a, b] = await Promise.all([hashPassword(GOOD_PASSWORD), hashPassword(GOOD_PASSWORD)]);
    assert.notEqual(a, b);
    assert.ok(await verifyPassword(GOOD_PASSWORD, a));
    assert.ok(await verifyPassword(GOOD_PASSWORD, b));
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword(GOOD_PASSWORD);
    assert.equal(await verifyPassword(GOOD_PASSWORD, hash), true);
    assert.equal(await verifyPassword('wrong-password-entirely', hash), false);
    assert.equal(await verifyPassword('', hash), false);
    assert.equal(await verifyPassword(`${GOOD_PASSWORD} `, hash), false);
  });

  it('handles Greek passwords and equivalent Unicode forms', async () => {
    const password = 'κωδικός-πρόσβασης-2026';
    const hash = await hashPassword(password);
    assert.ok(await verifyPassword(password, hash));
    // The same text decomposed must still verify.
    assert.ok(await verifyPassword(password.normalize('NFD'), hash));
  });

  it('returns false rather than throwing on a malformed stored hash', async () => {
    for (const bad of [
      '',
      'not-a-hash',
      'scrypt$1$1$1$a$b',
      'scrypt$32768$8$1$short$short',
      'bcrypt$32768$8$1$AAAA$AAAA',
      'scrypt$999999999$8$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAA',
      'scrypt$32768$8',
    ]) {
      assert.equal(await verifyPassword(GOOD_PASSWORD, bad), false, `threw or passed on: ${bad}`);
    }
    assert.equal(await verifyPassword(GOOD_PASSWORD, null), false);
    assert.equal(await verifyPassword(null, await hashPassword(GOOD_PASSWORD)), false);
  });

  it('refuses to hash an empty or absurdly long password', async () => {
    await assert.rejects(() => hashPassword(''), /required/);
    await assert.rejects(() => hashPassword(null), /required/);
    await assert.rejects(() => hashPassword('x'.repeat(2000)), /too long/);
  });

  it('does real work for a non-existent user, so timing reveals nothing', async () => {
    const started = process.hrtime.bigint();
    assert.equal(await verifyPasswordDummy(GOOD_PASSWORD), false);
    const dummyMs = Number(process.hrtime.bigint() - started) / 1e6;

    const hash = await hashPassword(GOOD_PASSWORD);
    const realStart = process.hrtime.bigint();
    await verifyPassword('wrong', hash);
    const realMs = Number(process.hrtime.bigint() - realStart) / 1e6;

    // Both paths run scrypt with the same parameters. Assert only that the
    // dummy is not trivially fast — exact timings are too noisy to compare.
    assert.ok(dummyMs > 1, `dummy verify took only ${dummyMs.toFixed(1)}ms`);
    assert.ok(realMs > 1);
  });

  it('flags hashes weaker than current policy for rehashing', async () => {
    assert.equal(needsRehash(await hashPassword(GOOD_PASSWORD)), false);
    assert.equal(needsRehash('scrypt$16384$8$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAA'), true);
    assert.equal(needsRehash('garbage'), true);
  });
});

describe('password policy', () => {
  it('requires a reasonable length', () => {
    assert.equal(checkPasswordStrength('short').ok, false);
    assert.equal(checkPasswordStrength('short').reason, 'too_short');
    assert.equal(checkPasswordStrength('x'.repeat(MIN_PASSWORD_LENGTH)).ok, true);
    assert.equal(checkPasswordStrength('x'.repeat(2000)).ok, false);
  });

  it('counts Greek characters correctly toward the minimum length', () => {
    // 12 Greek characters, some accented — must count as 12, not as bytes.
    assert.equal(checkPasswordStrength('αβγδεζηθικλμ').ok, true);
    assert.equal(checkPasswordStrength('άέήίόύώαβγδε').ok, true);
    assert.equal(checkPasswordStrength('αβγδε').ok, false);
  });

  it('rejects the most obvious choices, whatever the casing', () => {
    assert.equal(checkPasswordStrength('librarian123').reason, 'too_common');
    assert.equal(checkPasswordStrength('LIBRARIAN123').reason, 'too_common');
    assert.equal(checkPasswordStrength('Password1234').reason, 'too_common');
    assert.equal(checkPasswordStrength('administrator').reason, 'too_common');
    // A Greek obvious choice is caught too.
    assert.equal(checkPasswordStrength('βιβλιοθηκη12').reason, 'too_common');
  });

  it('accepts a reasonable passphrase', () => {
    assert.equal(checkPasswordStrength('correct-horse-battery-staple').ok, true);
    assert.equal(checkPasswordStrength('η-βιβλιοθηκη-του-σχολειου').ok, true);
  });

  it('rejects non-strings', () => {
    assert.equal(checkPasswordStrength(undefined).ok, false);
    assert.equal(checkPasswordStrength(12345678901234).ok, false);
  });
});

describe('staff accounts', () => {
  it('stores only a hash, never the password', async () => {
    const db = makeTestDb();
    await createStaffUser(db, {
      username: 'maria',
      password: GOOD_PASSWORD,
      displayName: 'Μαρία',
      role: 'admin',
    });

    const row = getStaffByUsername(db, 'maria');
    assert.ok(row.password_hash.startsWith('scrypt$'));
    assert.ok(!JSON.stringify(row).includes(GOOD_PASSWORD));
    assert.ok(await verifyPassword(GOOD_PASSWORD, row.password_hash));
    db.close();
  });

  it('matches a username case-insensitively', async () => {
    const db = makeTestDb();
    await createStaffUser(db, { username: 'Maria', password: GOOD_PASSWORD, displayName: 'M' });
    assert.ok(getStaffByUsername(db, 'maria'));
    assert.ok(getStaffByUsername(db, 'MARIA'));
    assert.ok(getStaffByUsername(db, '  Maria  '));
    db.close();
  });

  it('refuses a duplicate username differing only in case', async () => {
    const db = makeTestDb();
    await createStaffUser(db, { username: 'maria', password: GOOD_PASSWORD, displayName: 'M' });
    const second = await createStaffUser(db, {
      username: 'MARIA',
      password: GOOD_PASSWORD,
      displayName: 'M',
    });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'duplicate_username');
    db.close();
  });

  it('locks an account after repeated failures and unlocks it when time passes', async () => {
    const db = makeTestDb();
    const created = await createStaffUser(db, {
      username: 'maria',
      password: GOOD_PASSWORD,
      displayName: 'M',
    });

    for (let attempt = 1; attempt < MAX_FAILED_LOGINS; attempt += 1) {
      const result = recordFailedLogin(db, created.id);
      assert.equal(result.locked, false, `locked too early at attempt ${attempt}`);
    }

    const final = recordFailedLogin(db, created.id);
    assert.equal(final.locked, true);
    assert.ok(final.until > new Date().toISOString());
    assert.ok(lockoutState(db, getStaffByUsername(db, 'maria')).locked);

    // Once the lock expires it clears itself and the counter resets.
    db.run('UPDATE staff_user SET locked_until = ? WHERE id = ?', '2020-01-01T00:00:00.000Z', created.id);
    assert.equal(lockoutState(db, getStaffByUsername(db, 'maria')).locked, false);
    assert.equal(getStaffByUsername(db, 'maria').failed_login_count, 0);
    assert.ok(LOCKOUT_MINUTES > 0);
    db.close();
  });

  it('clears the failure counter on a successful login', async () => {
    const db = makeTestDb();
    const created = await createStaffUser(db, {
      username: 'maria',
      password: GOOD_PASSWORD,
      displayName: 'M',
    });
    recordFailedLogin(db, created.id);
    recordFailedLogin(db, created.id);

    recordSuccessfulLogin(db, created.id);
    const row = getStaffByUsername(db, 'maria');
    assert.equal(row.failed_login_count, 0);
    assert.equal(row.locked_until, null);
    assert.ok(row.last_login_at);
    db.close();
  });

  it('will not let the last admin be demoted or deactivated', async () => {
    const db = makeTestDb();
    const admin = await createStaffUser(db, {
      username: 'admin',
      password: GOOD_PASSWORD,
      displayName: 'A',
      role: 'admin',
    });
    await createStaffUser(db, {
      username: 'helper',
      password: GOOD_PASSWORD,
      displayName: 'H',
      role: 'librarian',
    });

    assert.equal(updateStaffUser(db, admin.id, { role: 'librarian' }).reason, 'last_admin');
    assert.equal(updateStaffUser(db, admin.id, { isActive: false }).reason, 'last_admin');

    // With a second admin in place, the first may step down.
    const second = await createStaffUser(db, {
      username: 'admin2',
      password: GOOD_PASSWORD,
      displayName: 'B',
      role: 'admin',
    });
    assert.ok(second.ok);
    assert.ok(updateStaffUser(db, admin.id, { role: 'librarian' }).ok);
    db.close();
  });

  it('rejects an invalid role at the database level', async () => {
    const db = makeTestDb();
    await assert.rejects(
      async () =>
        createStaffUser(db, {
          username: 'x',
          password: GOOD_PASSWORD,
          displayName: 'X',
          role: 'superuser',
        }),
      /CHECK constraint failed/,
    );
    db.close();
  });
});
