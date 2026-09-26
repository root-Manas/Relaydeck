const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSource, parseFeed, matches, privateAddress } = require('../src/sources');

test('source values are normalized and invalid values are rejected', () => {
  assert.equal(validateSource('github', 'https://github.com/root-Manas/Tweecord/'), 'root-Manas/Tweecord');
  assert.equal(validateSource('bluesky', '@Example.BSky.Social'), 'example.bsky.social');
  assert.equal(validateSource('x', '@root_Manas'), 'root_Manas');
  assert.throws(() => validateSource('rss', 'http://example.com/feed.xml'), /HTTPS/);
  assert.throws(() => validateSource('github', 'bad/name/extra'), /owner\/repository/);
  assert.throws(() => validateSource('x', 'https://x.com/example'), /username/);
});

test('RSS and Atom items have stable identities and useful text', () => {
  const rss = `<rss version="2.0"><channel><item><guid>post-1</guid><title>A &amp; B</title><link>https://example.com/one</link><description><![CDATA[<p>Useful <b>update</b>.</p>]]></description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>`;
  const [item] = parseFeed(rss);
  assert.equal(item.title, 'A & B');
  assert.equal(item.summary, 'Useful update.');
  assert.equal(item.url, 'https://example.com/one');
  assert.equal(parseFeed(rss)[0].id, item.id);
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:example.com,2024:2</id><title>Release two</title><link rel="alternate" href="/two"/><summary>Ready</summary></entry></feed>`;
  assert.equal(parseFeed(atom, 'https://example.com/feed.atom')[0].url, 'https://example.com/two');
});

test('filters include any wanted phrase and exclude unwanted phrases', () => {
  const item = { title: 'Security patch', summary: 'A Linux release' };
  assert.equal(matches(item, { include_words: 'release, update', exclude_words: 'sponsored' }), true);
  assert.equal(matches(item, { include_words: 'release', exclude_words: 'linux' }), false);
  assert.equal(matches(item, { include_words: 'sports', exclude_words: '' }), false);
});

test('private network addresses are recognized', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '192.168.1.4', '169.254.1.2', '::1', 'fd00::1'])
    assert.equal(privateAddress(address), true, address);
  assert.equal(privateAddress('8.8.8.8'), false);
});
