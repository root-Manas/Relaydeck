const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('../src/store');
const { saveConfig, importLegacyEnv } = require('../src/config');

test('dashboard settings persist without returning secret values', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'relaydeck-config-'));
  try {
    let store = openStore(directory);
    const secret = 'test-token-which-is-long-enough';
    const result = saveConfig(store, { clientId: '123456789012345678', guildId: '123456789012345679',
      discordToken: secret, githubToken: 'github-test-value', xToken: 'x-test-value' });
    assert.equal(result.status.discordTokenSet, true);
    assert.equal(JSON.stringify(result).includes(secret), false);
    store.close();
    store = openStore(directory);
    assert.equal(store.getSetting('discordToken'), secret);
    assert.equal(store.credentials().githubToken, 'github-test-value');
    saveConfig(store, { discordToken: '', guildId: '' });
    assert.equal(store.getSetting('discordToken'), secret);
    assert.equal(store.getSetting('guildId'), '');
    saveConfig(store, { discordToken: null });
    assert.equal(store.configStatus().discordTokenSet, false);
    assert.throws(() => saveConfig(store, { clientId: 'bad', githubToken: 'changed' }), /Discord ID/);
    assert.equal(store.getSetting('githubToken'), 'github-test-value');
    store.close();
  } finally {
    assert.equal(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep), true);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('legacy environment values are imported once', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'relaydeck-legacy-'));
  const old = process.env.GITHUB_TOKEN;
  try {
    const store = openStore(directory);
    process.env.GITHUB_TOKEN = 'first-token';
    importLegacyEnv(store);
    assert.equal(store.getSetting('githubToken'), 'first-token');
    store.setSetting('githubToken', '');
    process.env.GITHUB_TOKEN = 'second-token';
    importLegacyEnv(store);
    assert.equal(store.getSetting('githubToken'), '');
    store.close();
  } finally {
    if (old === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = old;
    assert.equal(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep), true);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
