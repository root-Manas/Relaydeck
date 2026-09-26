const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'relaydeck.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      type TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 10,
      include_words TEXT NOT NULL DEFAULT '', exclude_words TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1, initialized INTEGER NOT NULL DEFAULT 0,
      last_checked TEXT, last_error TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      title TEXT NOT NULL, url TEXT, published TEXT, status TEXT NOT NULL,
      error TEXT, created_at TEXT NOT NULL, delivered_at TEXT,
      PRIMARY KEY (source_id, id)
    );
    CREATE INDEX IF NOT EXISTS sources_due ON sources(enabled,last_checked);
    CREATE INDEX IF NOT EXISTS entries_created ON entries(created_at DESC);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const setting = key => db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value || '';
  const now = () => new Date().toISOString();
  return {
    db,
    getSetting: setting,
    setSetting(key, value) {
      if (!['discordToken', 'clientId', 'guildId', 'githubToken', 'xToken', 'legacyImported'].includes(key)) throw new Error('Unknown setting.');
      if (!value) db.prepare('DELETE FROM settings WHERE key=?').run(key);
      else db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
    },
    credentials: () => ({ githubToken: setting('githubToken'), xToken: setting('xToken') }),
    configStatus: () => ({ clientId: setting('clientId'), guildId: setting('guildId'),
      discordTokenSet: !!setting('discordToken'), githubTokenSet: !!setting('githubToken'),
      xTokenSet: !!setting('xToken') }),
    sources: guildId => guildId ? db.prepare('SELECT * FROM sources WHERE guild_id=? ORDER BY created_at DESC').all(guildId)
      : db.prepare('SELECT * FROM sources ORDER BY created_at DESC').all(),
    source: id => db.prepare('SELECT * FROM sources WHERE id=?').get(id),
    addSource(input) {
      const id = randomUUID();
      db.prepare(`INSERT INTO sources(id,guild_id,channel_id,type,name,value,interval_minutes,include_words,exclude_words,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, input.guildId, input.channelId, input.type, input.name,
          input.value, input.intervalMinutes, input.includeWords, input.excludeWords, now());
      return id;
    },
    setEnabled(id, enabled) { return db.prepare('UPDATE sources SET enabled=? WHERE id=?').run(enabled ? 1 : 0, id).changes; },
    updateSource(id, input) {
      return db.prepare(`UPDATE sources SET channel_id=?,name=?,interval_minutes=?,include_words=?,exclude_words=? WHERE id=?`)
        .run(input.channelId, input.name, input.intervalMinutes, input.includeWords, input.excludeWords, id).changes;
    },
    deleteSource(id) { return db.prepare('DELETE FROM sources WHERE id=?').run(id).changes; },
    markChecked(id, error = null, initialized = null) {
      if (initialized === null) db.prepare('UPDATE sources SET last_checked=?,last_error=? WHERE id=?').run(now(), error, id);
      else db.prepare('UPDATE sources SET last_checked=?,last_error=?,initialized=? WHERE id=?').run(now(), error, initialized ? 1 : 0, id);
    },
    entry(sourceId, id) { return db.prepare('SELECT * FROM entries WHERE source_id=? AND id=?').get(sourceId, id); },
    record(sourceId, item, status, error = null) {
      db.prepare(`INSERT INTO entries(id,source_id,title,url,published,status,error,created_at,delivered_at)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,id) DO UPDATE SET status=excluded.status,error=excluded.error,
        delivered_at=excluded.delivered_at`).run(item.id, sourceId, item.title, item.url || null,
          item.published || null, status, error, now(), status === 'delivered' ? now() : null);
    },
    recent(limit = 80) { return db.prepare(`SELECT e.*,s.name source_name,s.guild_id FROM entries e JOIN sources s ON s.id=e.source_id
      ORDER BY e.created_at DESC LIMIT ?`).all(limit); },
    stats() {
      return { sources: db.prepare('SELECT COUNT(*) n FROM sources').get().n,
        delivered: db.prepare("SELECT COUNT(*) n FROM entries WHERE status='delivered'").get().n,
        failed: db.prepare("SELECT COUNT(*) n FROM entries WHERE status='failed'").get().n };
    },
    close() { db.close(); }
  };
}

module.exports = { openStore };
