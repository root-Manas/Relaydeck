const dns = require('node:dns/promises');
const net = require('node:net');
const { createHash } = require('node:crypto');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true, processEntities: true });
const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
const plain = value => typeof value === 'string' ? value : typeof value === 'number' ? String(value)
  : value && typeof value === 'object' ? plain(value['#text'] ?? value['@_href'] ?? '') : '';
const clean = value => plain(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
const hash = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 32);

function privateAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }
  const lower = address.toLowerCase();
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd')
    || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea')
    || lower.startsWith('feb') || lower.startsWith('::ffff:');
}

async function assertPublicUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Enter a valid HTTPS feed URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443')
    throw new Error('Feeds must use a public HTTPS URL.');
  if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.local'))
    throw new Error('Local feed addresses are not supported.');
  const answers = await dns.lookup(url.hostname, { all: true });
  if (!answers.length || answers.some(answer => privateAddress(answer.address)))
    throw new Error('Feed address resolves to a private network.');
  return url;
}

function validateSource(type, value) {
  value = String(value || '').trim();
  if (type === 'rss') {
    let url;
    try { url = new URL(value); } catch { throw new Error('Enter a valid HTTPS feed URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Enter a public HTTPS feed URL.');
    return url.href;
  }
  if (type === 'github') {
    value = value.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(value)) throw new Error('Use owner/repository for GitHub releases.');
    return value;
  }
  if (type === 'bluesky') {
    value = value.replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]{1,250}[a-z0-9]$/.test(value) || !value.includes('.'))
      throw new Error('Use a Bluesky handle such as example.bsky.social.');
    return value;
  }
  if (type === 'x') {
    value = value.replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{1,15}$/.test(value)) throw new Error('Use an X username without a URL.');
    return value;
  }
  throw new Error('Source type must be RSS, GitHub releases, Bluesky, or X.');
}

async function readLimited(response) {
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const parts = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_000_000) { await reader.cancel(); throw new Error('Source response is too large.'); }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
}

async function fetchFeed(urlString) {
  let url = await assertPublicUrl(urlString);
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': 'Relaydeck/1.0 (+https://github.com/root-Manas/Relaydeck)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (!next) throw new Error('Feed redirected without a location.');
      url = await assertPublicUrl(new URL(next, url).href);
      continue;
    }
    return parseFeed(await readLimited(response), url.href);
  }
  throw new Error('Feed redirected too many times.');
}

function parseFeed(xml, baseUrl = 'https://example.com/') {
  const data = parser.parse(xml);
  const atom = data.feed;
  const raw = atom ? asArray(atom.entry) : asArray(data.rss?.channel?.item ?? data['rdf:RDF']?.item);
  if (!atom && !data.rss && !data['rdf:RDF']) throw new Error('This URL did not return an RSS or Atom feed.');
  return raw.slice(0, 30).map(entry => {
    const links = asArray(entry.link);
    const chosen = links.find(link => typeof link === 'object' && (!link['@_rel'] || link['@_rel'] === 'alternate')) ?? links[0];
    let link = plain(chosen);
    try { link = new URL(link, baseUrl).href; } catch { link = ''; }
    const title = clean(entry.title) || 'Untitled update';
    const guid = plain(entry.guid ?? entry.id) || link || `${title}:${plain(entry.pubDate ?? entry.updated)}`;
    return { id: hash(guid), title: title.slice(0, 250), url: link,
      summary: clean(entry.description ?? entry.summary ?? entry['content:encoded'] ?? entry.content).slice(0, 1000),
      published: plain(entry.pubDate ?? entry.published ?? entry.updated) };
  });
}

async function fetchGithub(repo) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'Relaydeck/1.0', 'x-github-api-version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`,
    { headers, signal: AbortSignal.timeout(12000) });
  const data = JSON.parse(await readLimited(response));
  if (!Array.isArray(data)) throw new Error('GitHub did not return releases.');
  return data.filter(release => !release.draft).map(release => ({ id: hash(release.id),
    title: release.name || release.tag_name, url: release.html_url,
    summary: clean(release.body).slice(0, 1000), published: release.published_at }));
}

async function fetchBluesky(handle) {
  const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed');
  url.searchParams.set('actor', handle); url.searchParams.set('limit', '30');
  url.searchParams.set('filter', 'posts_no_replies');
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Relaydeck/1.0' } });
  const data = JSON.parse(await readLimited(response));
  return asArray(data.feed).filter(row => !row.reason && row.post?.record?.text).map(row => {
    const post = row.post; const rkey = post.uri.split('/').pop();
    return { id: hash(post.uri), title: `${post.author.displayName || post.author.handle} posted`,
      url: `https://bsky.app/profile/${encodeURIComponent(post.author.handle)}/post/${encodeURIComponent(rkey)}`,
      summary: post.record.text.slice(0, 1000), published: post.record.createdAt };
  });
}

const xUserIds = new Map();
async function fetchX(username) {
  if (!process.env.X_BEARER_TOKEN) throw new Error('Set X_BEARER_TOKEN to follow X accounts. X API read access is required.');
  const headers = { authorization: `Bearer ${process.env.X_BEARER_TOKEN}`, 'user-agent': 'Relaydeck/1.0' };
  let id = xUserIds.get(username.toLowerCase());
  if (!id) {
    const lookup = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`,
      { headers, signal: AbortSignal.timeout(12000) });
    const user = JSON.parse(await readLimited(lookup)).data;
    if (!user?.id) throw new Error('X did not return this account. Check the username and API access.');
    id = user.id; xUserIds.set(username.toLowerCase(), id);
  }
  const url = new URL(`https://api.x.com/2/users/${id}/tweets`);
  url.searchParams.set('max_results', '20'); url.searchParams.set('tweet.fields', 'created_at');
  url.searchParams.set('exclude', 'retweets,replies');
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  const data = JSON.parse(await readLimited(response));
  return asArray(data.data).map(post => ({ id: hash(post.id), title: `@${username} posted`,
    url: `https://x.com/${encodeURIComponent(username)}/status/${post.id}`,
    summary: String(post.text || '').slice(0, 1000), published: post.created_at }));
}

async function fetchItems(source) {
  if (source.type === 'rss') return fetchFeed(source.value);
  if (source.type === 'github') return fetchGithub(source.value);
  if (source.type === 'bluesky') return fetchBluesky(source.value);
  if (source.type === 'x') return fetchX(source.value);
  throw new Error('Unknown source type.');
}

function matches(item, source) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const include = String(source.include_words || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const exclude = String(source.exclude_words || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return (!include.length || include.some(word => text.includes(word))) && !exclude.some(word => text.includes(word));
}

module.exports = { validateSource, parseFeed, fetchItems, matches, privateAddress };
