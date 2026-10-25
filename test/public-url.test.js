// The library's public address, and making one change to it reach everywhere.
//
// PORT was already honoured by the application and hardcoded in two other
// places — the Nginx site and the deployment guide — so changing it in `.env`
// left Nginx proxying to a port nothing was listening on. The domain was
// worse: it existed nowhere but as `library.example.gr` in an example file
// with a "change this" comment beside it.
//
// So there is one variable for the address, and the files that need it are
// generated from it rather than copied and edited.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { renderNginxConf, renderSystemdUnit } from '../scripts/render-deploy.js';

const base = {
  NODE_ENV: 'production',
  SESSION_SECRET: 'a-production-secret-that-is-long-enough-yes',
  TRUST_PROXY: 'true',
};

describe('PUBLIC_URL', () => {
  it('is derived from HOST and PORT when nobody sets it', () => {
    const config = loadConfig({ NODE_ENV: 'development', PORT: '4000' });
    assert.equal(config.publicUrl, 'http://127.0.0.1:4000');
    assert.equal(config.publicUrlDerived, true);
  });

  it('says localhost when HOST is a wildcard, which is no use in a link', () => {
    for (const host of ['0.0.0.0', '::']) {
      const config = loadConfig({ NODE_ENV: 'development', HOST: host, PORT: '4000' });
      assert.equal(config.publicUrl, 'http://localhost:4000', host);
    }
  });

  it('leaves the port off a derived URL when it is the default for the scheme', () => {
    const config = loadConfig({ NODE_ENV: 'development', PORT: '80' });
    assert.equal(config.publicUrl, 'http://127.0.0.1');
  });

  it('takes what it is given', () => {
    const config = loadConfig({ ...base, PUBLIC_URL: 'https://library.example.gr' });
    assert.equal(config.publicUrl, 'https://library.example.gr');
    assert.equal(config.publicHost, 'library.example.gr');
  });

  it('drops a trailing slash, so joining a path never doubles it', () => {
    const config = loadConfig({ ...base, PUBLIC_URL: 'https://library.example.gr/' });
    assert.equal(config.publicUrl, 'https://library.example.gr');
  });

  it('keeps a non-standard port in the host, for Nginx on an odd port', () => {
    const config = loadConfig({ ...base, PUBLIC_URL: 'https://library.example.gr:8443' });
    assert.equal(config.publicHost, 'library.example.gr');
    assert.equal(config.publicUrl, 'https://library.example.gr:8443');
  });

  it('refuses something that is not an http address', () => {
    for (const bad of ['library.example.gr', 'ftp://x.gr', 'not a url', 'javascript:alert(1)']) {
      assert.throws(() => loadConfig({ ...base, PUBLIC_URL: bad }), /PUBLIC_URL/, bad);
    }
  });

  it('refuses an address carrying a path, query or fragment', () => {
    // It is joined with paths like /setup, so anything after the host would
    // silently produce a link to the wrong place.
    for (const bad of [
      'https://library.example.gr/library',
      'https://library.example.gr/?x=1',
      'https://library.example.gr/#top',
    ]) {
      assert.throws(() => loadConfig({ ...base, PUBLIC_URL: bad }), /PUBLIC_URL/, bad);
    }
  });

  it('warns rather than refuses when production is served over plain http', () => {
    const config = loadConfig({ ...base, PUBLIC_URL: 'http://library.example.gr' });
    assert.equal(config.publicUrl, 'http://library.example.gr');
    assert.equal(config.publicUrlInsecure, true);
  });
});

describe('the generated Nginx site', () => {
  const config = loadConfig({
    ...base,
    PORT: '4100',
    PUBLIC_URL: 'https://library.example.gr',
  });

  const conf = renderNginxConf(config, { projectRoot: '/opt/dslib' });

  it('proxies to the port the application is actually listening on', () => {
    assert.match(conf, /proxy_pass http:\/\/127\.0\.0\.1:4100;/);
    assert.ok(!conf.includes(':3000'), 'the old default port survived');
  });

  it('proxies every location to that one port', () => {
    const ports = [...conf.matchAll(/proxy_pass http:\/\/127\.0\.0\.1:(\d+)/g)].map((m) => m[1]);
    assert.ok(ports.length >= 4, `only ${ports.length} proxy_pass lines`);
    assert.deepEqual([...new Set(ports)], ['4100']);
  });

  it('names the real domain in server_name and the certificate paths', () => {
    assert.match(conf, /server_name library\.example\.gr;/);
    assert.match(conf, /\/etc\/letsencrypt\/live\/library\.example\.gr\/fullchain\.pem/);
    assert.ok(!conf.includes('<-- change this'), 'a placeholder comment survived');
  });

  it('leaves no unsubstituted placeholder behind', () => {
    assert.ok(!/\{\{\s*\w+\s*\}\}/.test(conf), conf.match(/\{\{\s*\w+\s*\}\}/)?.[0]);
  });

  it('says it was generated, and from what', () => {
    assert.match(conf, /generated/i);
    assert.match(conf, /npm run deploy:config/);
  });
});

describe('the generated systemd unit', () => {
  const config = loadConfig({ ...base, PORT: '4100', PUBLIC_URL: 'https://library.example.gr' });
  const unit = renderSystemdUnit(config, { projectRoot: '/srv/dslib', user: 'dslib' });

  it('runs from the directory it was told about', () => {
    assert.match(unit, /WorkingDirectory=\/srv\/dslib/);
    assert.match(unit, /ReadWritePaths=\/srv\/dslib\/data/);
  });

  it('keeps MemoryDenyWriteExecute off, which Node needs to start at all', () => {
    assert.match(unit, /MemoryDenyWriteExecute=false/);
  });

  it('names the node that generated it, not a guessed path', () => {
    // systemd's only complaint about a wrong interpreter is a service that
    // will not start, so the unit names the binary actually in use.
    const pinned = renderSystemdUnit(config, {
      projectRoot: '/srv/dslib',
      nodePath: '/usr/local/bin/node',
    });
    assert.match(pinned, /ExecStart=\/usr\/local\/bin\/node src\/server\.js/);
    assert.ok(!pinned.includes('/usr/bin/node '), 'the hardcoded path survived');
  });

  it('leaves no unsubstituted placeholder behind', () => {
    assert.ok(!/\{\{\s*\w+\s*\}\}/.test(unit), unit.match(/\{\{\s*\w+\s*\}\}/)?.[0]);
  });
});
