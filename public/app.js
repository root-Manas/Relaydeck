const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateLabel = value => value ? new Date(value).toLocaleString() : 'Not checked yet';
let toastTimer;

function toast(message) {
  const node = $('#toast'); node.textContent = message; node.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 4000);
}

function renderSource(source) {
  const status = source.lastError ? 'error' : source.enabled ? 'active' : 'paused';
  return `<article class="source"><div class="source-id"><span>${escapeHtml(source.type)}</span><small>${escapeHtml(source.id.slice(0, 8))}</small></div>
    <div class="source-main"><h3>${escapeHtml(source.name)}</h3><p>${escapeHtml(source.value)}</p><div class="source-detail">channel ${escapeHtml(source.channelId)} · every ${source.intervalMinutes} min · ${escapeHtml(dateLabel(source.lastChecked))}</div>
    ${source.includeWords ? `<div class="filter">include: ${escapeHtml(source.includeWords)}</div>` : ''}${source.excludeWords ? `<div class="filter">exclude: ${escapeHtml(source.excludeWords)}</div>` : ''}
    ${source.lastError ? `<div class="source-error">${escapeHtml(source.lastError)}</div>` : ''}</div>
    <div class="source-actions"><span class="status ${status}">${status}</span><button data-check="${escapeHtml(source.id)}" type="button">Check now ↗</button></div></article>`;
}

function renderEntry(entry) {
  const href = entry.url?.startsWith('https://') ? `<a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer">open ↗</a>` : '';
  return `<div class="entry"><span class="entry-status ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span><div><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.source_name)} · ${escapeHtml(dateLabel(entry.created_at))}${entry.error ? ` · ${escapeHtml(entry.error)}` : ''}</small></div>${href}</div>`;
}

async function refresh() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Dashboard returned ${response.status}`);
    const state = await response.json();
    const connected = state.connection === 'connected' || !state.connection && state.bot !== 'Not connected';
    $('#bot-name').textContent = connected ? `${state.bot} · ${state.guilds} server${state.guilds === 1 ? '' : 's'}`
      : state.connection === 'connecting' ? 'Connecting to Discord…' : 'Not connected';
    $('#bot-detail').textContent = state.connectionError || (connected ? 'Bot is online. Add sources with /source in Discord.'
      : 'Add a bot token and application ID in API settings.');
    $('#stat-sources').textContent = state.stats.sources;
    $('#stat-delivered').textContent = state.stats.delivered;
    $('#stat-failed').textContent = state.stats.failed;
    $('#stat-guilds').textContent = state.guilds;
    $('#sources').innerHTML = state.sources.length ? state.sources.map(renderSource).join('') : '<p class="empty">No sources yet. Add one with /source add in Discord.</p>';
    $('#entries').innerHTML = state.entries.length ? state.entries.map(renderEntry).join('') : '<p class="empty">No activity yet. New items appear after a source is added and checked.</p>';
  } catch (error) { toast(error.message); }
}

function showConfig(config) {
  $('#client-id').value = config.clientId || '';
  $('#guild-id').value = config.guildId || '';
  for (const [key, name] of [['discordToken', 'discord-token'], ['githubToken', 'github-token'], ['xToken', 'x-token']]) {
    const saved = !!config[`${key}Set`];
    $(`#${name}-status`).textContent = saved ? 'Saved locally' : 'Not saved';
    document.querySelector(`[data-clear="${key}"]`).disabled = !saved;
  }
}

async function refreshConfig() {
  const response = await fetch('/api/config', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Settings returned ${response.status}`);
  showConfig(await response.json());
}

async function saveConfig(input) {
  const response = await fetch('/api/config', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-relaydeck': 'dashboard' }, body: JSON.stringify(input) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Settings could not be saved.');
  showConfig(data);
  return data;
}

$('#config-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#config-form button[type=submit]'); button.disabled = true;
  const input = { clientId: $('#client-id').value, guildId: $('#guild-id').value };
  for (const [key, name] of [['discordToken', 'discord-token'], ['githubToken', 'github-token'], ['xToken', 'x-token']]) {
    if ($(`#${name}`).value.trim()) input[key] = $(`#${name}`).value.trim();
  }
  try {
    await saveConfig(input);
    for (const name of ['discord-token', 'github-token', 'x-token']) $(`#${name}`).value = '';
    $('#config-message').textContent = 'Settings saved. Connection status will update above.';
    await refresh();
  } catch (error) { $('#config-message').textContent = error.message; }
  finally { button.disabled = false; }
});

document.addEventListener('click', async event => {
  const clear = event.target.closest('[data-clear]');
  if (clear) {
    clear.disabled = true;
    try {
      await saveConfig({ [clear.dataset.clear]: null });
      $(`#${{ discordToken: 'discord-token', githubToken: 'github-token', xToken: 'x-token' }[clear.dataset.clear]}`).value = '';
      $('#config-message').textContent = 'Credential removed.';
      await refresh();
    } catch (error) { $('#config-message').textContent = error.message; clear.disabled = false; }
    return;
  }
  const button = event.target.closest('[data-check]');
  if (!button) return;
  button.disabled = true; button.textContent = 'Checking…';
  try {
    const response = await fetch(`/api/check/${button.dataset.check}`, { method: 'POST', headers: { 'x-relaydeck': 'dashboard' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Check failed.');
    toast(result.busy ? 'This source is already being checked.' : `Check complete. ${result.delivered} delivered, ${result.filtered} filtered.`);
    await refresh();
  } catch (error) { toast(error.message); button.disabled = false; button.textContent = 'Check now ↗'; }
});

refresh();
refreshConfig().catch(error => toast(error.message));
setInterval(refresh, 30_000);
