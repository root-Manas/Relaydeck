const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { saveConfig } = require('./config');

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
  res.end(body);
}

function startDashboard(store, botStatus, pollSource, onConfigSaved = () => {}) {
  const port = Number(process.env.PORT || 4317);
  const server = http.createServer(async (req, res) => {
    try {
      const activePort = server.address()?.port || port;
      const localOrigin = `http://127.0.0.1:${activePort}`;
      const url = new URL(req.url, localOrigin);
      if (req.headers.host !== `127.0.0.1:${activePort}`)
        return send(res, 403, JSON.stringify({ error: 'Open the dashboard at 127.0.0.1.' }));
      if (req.method === 'GET' && url.pathname === '/api/config')
        return send(res, 200, JSON.stringify({ ...store.configStatus(), ...botStatus() }));
      if (req.method === 'POST' && url.pathname === '/api/config') {
        const origin = req.headers.origin;
        if (req.headers['x-relaydeck'] !== 'dashboard' || origin && origin !== localOrigin
          || !String(req.headers['content-type'] || '').startsWith('application/json'))
          return send(res, 403, JSON.stringify({ error: 'Request was not sent by the local dashboard.' }));
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16000) return send(res, 413, JSON.stringify({ error: 'Settings request is too large.' }));
        }
        let input;
        try { input = JSON.parse(body); } catch { return send(res, 400, JSON.stringify({ error: 'Invalid JSON.' })); }
        let result;
        try { result = saveConfig(store, input); }
        catch (error) { return send(res, 400, JSON.stringify({ error: String(error.message).slice(0, 240) })); }
        Promise.resolve().then(() => onConfigSaved(result.changed)).catch(error => console.error(`Bot connection: ${error.message}`));
        return send(res, 200, JSON.stringify(result.status));
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const sources = store.sources().map(({ id, guild_id, channel_id, type, name, value,
          interval_minutes, include_words, exclude_words, enabled, initialized, last_checked, last_error }) =>
          ({ id, guildId: guild_id, channelId: channel_id, type, name, value, intervalMinutes: interval_minutes,
            includeWords: include_words, excludeWords: exclude_words, enabled: !!enabled,
            initialized: !!initialized, lastChecked: last_checked, lastError: last_error }));
        return send(res, 200, JSON.stringify({ ...botStatus(), stats: store.stats(), sources, entries: store.recent(80) }));
      }
      if (req.method === 'POST' && /^\/api\/check\/[a-f0-9-]{36}$/.test(url.pathname)) {
        const origin = req.headers.origin;
        if (req.headers['x-relaydeck'] !== 'dashboard' || origin && origin !== localOrigin)
          return send(res, 403, JSON.stringify({ error: 'Request was not sent by the local dashboard.' }));
        const source = store.source(url.pathname.split('/').pop());
        if (!source) return send(res, 404, JSON.stringify({ error: 'Source not found.' }));
        const result = await pollSource(source);
        return send(res, 200, JSON.stringify(result));
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [name, type] = assets.get(url.pathname);
        return send(res, 200, fs.readFileSync(path.join(__dirname, '..', 'public', name)), type);
      }
      return send(res, 404, JSON.stringify({ error: 'Not found.' }));
    } catch (error) { return send(res, 500, JSON.stringify({ error: String(error.message || error).slice(0, 240) })); }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${server.address().port}`));
  return server;
}

module.exports = { startDashboard };
