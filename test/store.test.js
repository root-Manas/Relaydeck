const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('../src/store');

test('subscriptions and delivery state persist across restarts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'relaydeck-test-'));
  try {
    let store = openStore(directory);
    const id = store.addSource({ guildId: 'guild', channelId: 'channel', type: 'rss', name: 'News',
      value: 'https://example.com/feed.xml', intervalMinutes: 10, includeWords: '', excludeWords: '' });
    const item = { id: 'item-1', title: 'First post', url: 'https://example.com/first', published: '2024-01-01' };
    store.record(id, item, 'seeded');
    store.markChecked(id, null, true);
    store.close();
    store = openStore(directory);
    assert.equal(store.source(id).initialized, 1);
    assert.equal(store.entry(id, item.id).status, 'seeded');
    store.record(id, item, 'delivered');
    assert.equal(store.stats().delivered, 1);
    store.updateSource(id, { channelId: 'another-channel', name: 'News', intervalMinutes: 30,
      includeWords: 'security', excludeWords: 'ads' });
    assert.equal(store.source(id).channel_id, 'another-channel');
    assert.equal(store.entry(id, item.id).status, 'delivered');
    store.setEnabled(id, false);
    assert.equal(store.source(id).enabled, 0);
    store.deleteSource(id);
    assert.equal(store.entry(id, item.id), undefined);
    store.close();
  } finally {
    assert.equal(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep), true);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
