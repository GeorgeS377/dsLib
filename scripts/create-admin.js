#!/usr/bin/env node
// Create a staff account interactively.
//
// This is the only way an account comes into existence. There is no default
// password anywhere in the codebase, no seeded admin, and no password in any
// migration — so a fresh deployment cannot be logged into until someone with
// shell access runs this and chooses a password.
//
// Usage:
//   npm run create-admin                      interactive
//   npm run create-admin -- --username maria   prompts for the rest
//   npm run create-admin -- --role librarian
//
// The password is read without echoing and is never passed as an argument,
// because command-line arguments are visible to other users via `ps` and are
// recorded in shell history.
import process from 'node:process';
import readline from 'node:readline';
import { closeDatabase, getDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { logAction } from '../src/db/queries/audit.js';
import {
  countActiveAdmins,
  createStaffUser,
  getStaffByUsername,
  listStaff,
} from '../src/db/queries/staff.js';
import { MIN_PASSWORD_LENGTH, checkPasswordStrength } from '../src/lib/password.js';
import { staffUserFormSchema } from '../src/lib/validation.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    if (key === 'help') {
      args.help = true;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Lines are pulled from readline's async iterator rather than through
// rl.question callbacks. With callbacks, piped input arrives in one burst and
// any line emitted between two questions is dropped — which made the script
// impossible to drive from a here-doc or a provisioning script. The iterator
// queues lines, so interactive and piped input behave the same.
const lines = rl[Symbol.asyncIterator]();

async function nextLine() {
  const { value, done } = await lines.next();
  if (done) throw new Error('Input ended before all questions were answered.');
  return value;
}

async function ask(question, fallback = '') {
  process.stdout.write(fallback ? `${question} [${fallback}]: ` : `${question}: `);
  const answer = (await nextLine()).trim();
  return answer || fallback;
}

/**
 * Read a line without echoing it, so the password leaves no trace on screen
 * or in a terminal scrollback buffer.
 */
async function askHidden(question) {
  process.stdout.write(`${question}: `);

  const originalWrite = process.stdout.write.bind(process.stdout);
  // Swallow echoed keystrokes while the answer is being typed.
  process.stdout.write = () => true;
  try {
    const answer = await nextLine();
    return answer;
  } finally {
    process.stdout.write = originalWrite;
    process.stdout.write('\n');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      'Create a staff account.\n\n' +
        '  npm run create-admin\n' +
        '  npm run create-admin -- --username maria --role librarian\n\n' +
        'The password is always prompted for, never taken from an argument.',
    );
    return;
  }

  const db = getDatabase();
  migrate(db);

  const existing = listStaff(db);
  const isFirstAccount = existing.length === 0;

  if (isFirstAccount) {
    console.log('No staff accounts exist yet. Creating the first administrator.\n');
  } else {
    console.log(`${existing.length} staff account(s) already exist:`);
    for (const user of existing) {
      console.log(
        `  ${user.username} (${user.role})${user.is_active ? '' : ' — deactivated'}`,
      );
    }
    console.log('');
  }

  const username = args.username ?? (await ask('Username (ASCII letters, digits, . _ -)'));
  const displayName = args['display-name'] ?? (await ask('Display name (shown in the interface)', username));
  const email = args.email ?? (await ask('Email (optional)'));
  // The first account must be an admin, or nobody could manage accounts.
  const role = isFirstAccount
    ? 'admin'
    : args.role ?? (await ask("Role ('admin' or 'librarian')", 'librarian'));

  const candidate = staffUserFormSchema.safeParse({
    username,
    display_name: displayName,
    email,
    role,
    is_active: true,
  });

  if (!candidate.success) {
    console.error('\nInvalid details:');
    for (const issue of candidate.error.issues) {
      console.error(`  ${issue.path.join('.') || 'input'}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (getStaffByUsername(db, username)) {
    console.error(`\nA staff account named "${username}" already exists.`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nChoose a password of at least ${MIN_PASSWORD_LENGTH} characters. ` +
      'A short phrase is both stronger and easier to remember than a mangled word.\n' +
      'Input is hidden.',
  );

  let password;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const first = await askHidden('Password');
    const strength = checkPasswordStrength(first);
    if (!strength.ok) {
      console.error(
        strength.reason === 'too_short'
          ? `  Too short — at least ${MIN_PASSWORD_LENGTH} characters, please.`
          : strength.reason === 'too_common'
            ? '  That password is too easily guessed. Choose another.'
            : '  That password is not acceptable.',
      );
      continue;
    }

    const second = await askHidden('Confirm password');
    if (first !== second) {
      console.error('  The two entries did not match.');
      continue;
    }

    password = first;
    break;
  }

  if (!password) {
    console.error('\nNo account was created.');
    process.exitCode = 1;
    return;
  }

  const result = await createStaffUser(db, {
    username: candidate.data.username,
    password,
    displayName: candidate.data.display_name,
    email: candidate.data.email || null,
    role: candidate.data.role,
  });

  if (!result.ok) {
    console.error(`\nCould not create the account: ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  logAction(db, {
    actor: { id: result.id, username: candidate.data.username },
    action: 'staff.create',
    entity: 'staff_user',
    entityId: result.id,
    detail: { role: candidate.data.role, via: 'create-admin script' },
  });

  console.log(
    `\n✓ Created ${candidate.data.role} account "${candidate.data.username}".\n` +
      `  Sign in at /staff/login\n` +
      `  Active administrators: ${countActiveAdmins(db)}`,
  );
}

try {
  await main();
} catch (error) {
  console.error(`\nFailed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  closeDatabase();
}
