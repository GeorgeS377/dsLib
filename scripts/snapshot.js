// Fetch a page from the review server and write it somewhere a browser can
// open it without signing in.
//
// Looking at a staff page while building one means being signed in, and
// driving a sign-in form through browser automation means typing a password
// into a form — which is not something to do casually even with a fixture.
// This signs in over HTTP instead, keeps the session in memory, and writes
// the rendered page to a file with its asset URLs made absolute so the
// stylesheet still loads from file://.
//
//   node scripts/snapshot.js /staff/search?q=οδυσ out.html
//   node scripts/snapshot.js --port 3100 /staff out.html
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let port = 3100;
const portAt = args.indexOf('--port');
if (portAt !== -1) {
  port = Number(args[portAt + 1]);
  args.splice(portAt, 2);
}

// Pairs of path and output file. Several pairs in one run matters: signing in
// once per page trips the login rate limiter after a handful, which is the
// limiter working correctly rather than a bug to route around.
if (args.length === 0 || args.length % 2 !== 0) {
  console.error('usage: node scripts/snapshot.js [--port N] <path> <out.html> [<path> <out.html>…]');
  process.exit(1);
}
const jobs = [];
for (let i = 0; i < args.length; i += 2) jobs.push({ path: args[i], out: args[i + 1] });

const base = `http://localhost:${port}`;
const USERNAME = 'maria';
const PASSWORD = 'a-long-enough-test-passphrase';

/** Collect cookies across requests the way a browser would. */
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const at = pair.indexOf('=');
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
}

async function visit(path, init = {}) {
  const response = await fetch(base + path, {
    redirect: 'manual',
    ...init,
    headers: { cookie: cookieHeader(), ...(init.headers ?? {}) },
  });
  absorb(response);
  return response;
}

const form = await visit('/staff/login');
const html = await form.text();
const token = html.match(/name="_csrf"\s+value="([^"]+)"/)?.[1];
if (!token) throw new Error('no CSRF token on the sign-in page — is the review server running?');

const signedIn = await visit('/staff/login', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ _csrf: token, username: USERNAME, password: PASSWORD }).toString(),
});
if (signedIn.status !== 302) throw new Error(`sign-in failed: ${signedIn.status}`);

for (const job of jobs) {
  const page = await visit(job.path);
  const body = await page.text();

  // Write the stylesheet beside the page and point at it relatively, so each
  // snapshot is self-contained and same-origin wherever it is served from.
  const sheet = body.match(/href="(\/assets\/css\/[^"]+)"/)?.[1];
  if (sheet) {
    const css = await fetch(base + sheet).then((r) => r.text());
    const name = sheet.split('/').pop();
    fs.writeFileSync(path.join(path.dirname(job.out), name), css);
    fs.writeFileSync(
      job.out,
      body.replaceAll(sheet, `./${name}`).replaceAll('"/assets/', `"${base}/assets/`),
    );
  } else {
    fs.writeFileSync(job.out, body.replaceAll('"/assets/', `"${base}/assets/`));
  }
  console.log(`${page.status}  ${job.path}  →  ${job.out}`);
}
