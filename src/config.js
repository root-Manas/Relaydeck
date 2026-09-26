const settingNames = ['discordToken', 'clientId', 'guildId', 'githubToken', 'xToken'];
const envNames = { discordToken: 'DISCORD_TOKEN', clientId: 'DISCORD_CLIENT_ID',
  guildId: 'DISCORD_GUILD_ID', githubToken: 'GITHUB_TOKEN', xToken: 'X_BEARER_TOKEN' };

function importLegacyEnv(store) {
  if (store.getSetting('legacyImported')) return;
  for (const key of settingNames) {
    if (!store.getSetting(key) && process.env[envNames[key]]) store.setSetting(key, process.env[envNames[key]]);
  }
  store.setSetting('legacyImported', '1');
}

function saveConfig(store, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings.');
  const changes = {};
  for (const key of settingNames) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value !== null && typeof value !== 'string') throw new Error(`${key} must be text.`);
    if (value === null) { changes[key] = ''; continue; }
    const trimmed = value.trim();
    if ((key === 'clientId' || key === 'guildId') && trimmed && !/^\d{16,25}$/.test(trimmed))
      throw new Error(`${key} must be a Discord ID.`);
    if (['discordToken', 'githubToken', 'xToken'].includes(key) && trimmed && (trimmed.length > 1500 || /\s/.test(trimmed)))
      throw new Error(`${key} contains whitespace or is too long.`);
    if (key === 'discordToken' && trimmed && trimmed.length < 20) throw new Error('Discord bot token looks too short.');
    if (trimmed || key === 'clientId' || key === 'guildId') changes[key] = trimmed;
  }
  for (const [key, value] of Object.entries(changes)) store.setSetting(key, value);
  return { changed: Object.keys(changes), status: store.configStatus() };
}

module.exports = { saveConfig, importLegacyEnv };
