const { startDashboard } = require('../src/dashboard');

const now = new Date().toISOString();
const sources = [
  { id: 'a9e613d0-3bd8-43c7-a2da-49d01ad95725', guild_id: '118034918194', channel_id: '118034918195', type: 'rss', name: 'Security notes', value: 'https://example.com/feed.xml', interval_minutes: 10, include_words: 'research, release', exclude_words: 'sponsored', enabled: 1, initialized: 1, last_checked: now, last_error: null },
  { id: 'b9e613d0-3bd8-43c7-a2da-49d01ad95725', guild_id: '118034918194', channel_id: '118034918196', type: 'github', name: 'Project releases', value: 'root-Manas/CLIx', interval_minutes: 30, include_words: '', exclude_words: '', enabled: 1, initialized: 1, last_checked: now, last_error: null },
  { id: 'c9e613d0-3bd8-43c7-a2da-49d01ad95725', guild_id: '118034918194', channel_id: '118034918197', type: 'bluesky', name: 'Field notes', value: 'example.bsky.social', interval_minutes: 15, include_words: '', exclude_words: '', enabled: 0, initialized: 1, last_checked: now, last_error: null }
];
const entries = [
  { status: 'delivered', title: 'A new release is available', source_name: 'Project releases', url: 'https://github.com/root-Manas/CLIx/releases', created_at: now },
  { status: 'filtered', title: 'Sponsored update', source_name: 'Security notes', url: 'https://example.com/story', created_at: now },
  { status: 'seeded', title: 'Older post, saved without sending', source_name: 'Field notes', url: 'https://bsky.app/', created_at: now }
];
startDashboard({ sources: () => sources, recent: () => entries, stats: () => ({ sources: 3, delivered: 128, failed: 0 }),
  configStatus: () => ({ clientId: '118034918194000000', guildId: '118034918194000001', discordTokenSet: true, githubTokenSet: true, xTokenSet: false }),
  source: id => sources.find(source => source.id === id) }, () => ({ bot: 'Relaydeck (preview)', guilds: 1, connection: 'connected', connectionError: '' }),
  async () => ({ seeded: 0, delivered: 0, filtered: 0 }));
