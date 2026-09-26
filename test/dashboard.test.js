const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { openStore } = require('../src/store');
const { startDashboard } = require('../src/dashboard');

test('dashboard saves API settings without exposing tokens', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'relaydeck-http-'));
  const previousPort = process.env.PORT;
  process.env.PORT = '0';
  const store = openStore(directory);
  const server = startDashboard(store, () => ({ connection: 'needs_config' }), async () => ({}));
  try {
    if (!server.listening) await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = 'github-token-never-return-this';
    const post = (origin) => fetch(`${base}/api/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relaydeck': 'dashboard', origin },
      body: JSON.stringify({ githubToken: token })
    });
    assert.equal((await post('http://invalid.example')).status, 403);
    assert.equal(store.getSetting('githubToken'), '');
    const saved = await post(base);
    assert.equal(saved.status, 200);
    const savedText = await saved.text();
    assert.equal(savedText.includes(token), false);
    assert.equal(JSON.parse(savedText).githubTokenSet, true);
    const readText = await (await fetch(`${base}/api/config`)).text();
    assert.equal(readText.includes(token), false);
    assert.equal(JSON.parse(readText).githubTokenSet, true);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
    if (previousPort === undefined) delete process.env.PORT; else process.env.PORT = previousPort;
    assert.equal(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep), true);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
