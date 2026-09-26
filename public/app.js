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
    $('#bot-name').textContent = `${state.bot} · ${state.guilds} server${state.guilds === 1 ? '' : 's'}`;
    $('#stat-sources').textContent = state.stats.sources;
    $('#stat-delivered').textContent = state.stats.delivered;
    $('#stat-failed').textContent = state.stats.failed;
    $('#stat-guilds').textContent = state.guilds;
    $('#sources').innerHTML = state.sources.length ? state.sources.map(renderSource).join('') : '<p class="empty">No sources yet. Add one with /source add in Discord.</p>';
    $('#entries').innerHTML = state.entries.length ? state.entries.map(renderEntry).join('') : '<p class="empty">No activity yet. New items appear after a source is added and checked.</p>';
  } catch (error) { toast(error.message); }
}

document.addEventListener('click', async event => {
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
setInterval(refresh, 30_000);
