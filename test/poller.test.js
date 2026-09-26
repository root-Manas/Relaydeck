const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('../src/store');
const { createPoller } = require('../src/poller');
const { matches } = require('../src/sources');

test('first check seeds; later checks filter, deliver once, and retry a failed send', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'relaydeck-poller-'));
  const store = openStore(directory);
  try {
    const id = store.addSource({ guildId: 'one-guild', channelId: 'one-channel', type: 'rss', name: 'Feed',
      value: 'https://example.com/feed.xml', intervalMinutes: 10, includeWords: 'release', excludeWords: 'spam' });
    const item = (number, title) => ({ id: String(number), title, url: `https://example.com/${number}`, summary: '' });
    let items = [item(1, 'Old release')];
    const sent = [];
    let fail = false;
    const poller = createPoller({ store, fetchItems: async () => items, matches,
      deliver: async (entry, source) => {
        assert.equal(source.channel_id, 'one-channel');
        if (fail) { fail = false; throw new Error('Discord unavailable'); }
        sent.push(entry.id);
      } });
    assert.equal((await poller.pollSource(store.source(id))).seeded, 1);
    assert.deepEqual(sent, []);
    items = [item(3, 'Spam release'), item(2, 'New release'), ...items];
    assert.deepEqual(await poller.pollSource(store.source(id)), { seeded: 0, delivered: 1, filtered: 1 });
    assert.deepEqual(sent, ['2']);
    assert.equal((await poller.pollSource(store.source(id))).delivered, 0);
    items = [item(4, 'Another release'), ...items];
    fail = true;
    await assert.rejects(poller.pollSource(store.source(id)), /Discord unavailable/);
    assert.equal(store.entry(id, '4').status, 'failed');
    assert.equal((await poller.pollSource(store.source(id))).delivered, 1);
    assert.deepEqual(sent, ['2', '4']);
  } finally {
    store.close();
    assert.equal(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep), true);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
