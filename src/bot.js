const path = require('node:path');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, MessageFlags,
  SlashCommandBuilder, EmbedBuilder, REST, Routes } = require('discord.js');
const { openStore } = require('./store');
const { validateSource, fetchItems, matches } = require('./sources');
const { startDashboard } = require('./dashboard');
const { createPoller } = require('./poller');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId) {
  console.error('Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env before starting Relaydeck.');
  process.exit(1);
}

const store = openStore(path.resolve(process.env.DATA_DIR || 'data'));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const typeOption = option => option.setName('type').setDescription('Where updates come from').setRequired(true)
  .addChoices({ name: 'RSS / Atom', value: 'rss' }, { name: 'GitHub releases', value: 'github' },
    { name: 'Bluesky posts', value: 'bluesky' }, { name: 'X posts (API token required)', value: 'x' });
const valueOption = option => option.setName('value').setDescription('Feed URL, owner/repo, or Bluesky handle').setRequired(true);
const idOption = option => option.setName('id').setDescription('Source ID or unique starting characters from /source list').setRequired(true);

const commands = [
  new SlashCommandBuilder().setName('source').setDescription('Manage update sources')
    .addSubcommand(sub => sub.setName('add').setDescription('Subscribe a channel to updates')
      .addStringOption(typeOption).addStringOption(valueOption)
      .addChannelOption(option => option.setName('channel').setDescription('Channel to receive updates').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption(option => option.setName('name').setDescription('A short label'))
      .addStringOption(option => option.setName('include').setDescription('Only items containing any of these words, comma-separated'))
      .addStringOption(option => option.setName('exclude').setDescription('Skip items containing any of these words, comma-separated'))
      .addIntegerOption(option => option.setName('minutes').setDescription('Check interval, 5–1440 minutes').setMinValue(5).setMaxValue(1440)))
    .addSubcommand(sub => sub.setName('list').setDescription('List sources in this server'))
    .addSubcommand(sub => sub.setName('update').setDescription('Change channel, label, interval, or filters')
      .addStringOption(idOption)
      .addChannelOption(option => option.setName('channel').setDescription('New destination channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption(option => option.setName('name').setDescription('New label'))
      .addStringOption(option => option.setName('include').setDescription('Comma-separated phrases; use - to clear'))
      .addStringOption(option => option.setName('exclude').setDescription('Comma-separated phrases; use - to clear'))
      .addIntegerOption(option => option.setName('minutes').setDescription('Check interval, 5–1440 minutes').setMinValue(5).setMaxValue(1440)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a source').addStringOption(idOption))
    .addSubcommand(sub => sub.setName('pause').setDescription('Pause a source').addStringOption(idOption))
    .addSubcommand(sub => sub.setName('resume').setDescription('Resume a source').addStringOption(idOption))
    .addSubcommand(sub => sub.setName('check').setDescription('Check a source now').addStringOption(idOption))
    .addSubcommand(sub => sub.setName('preview').setDescription('Preview recent items before subscribing')
      .addStringOption(typeOption).addStringOption(valueOption)),
  new SlashCommandBuilder().setName('relay-status').setDescription('Show Relaydeck status and recent deliveries'),
  new SlashCommandBuilder().setName('relay-help').setDescription('Show setup and command help')
].map(command => command.toJSON());

function compactError(error) { return String(error?.message || error).slice(0, 240); }
function sourceForGuild(guildId, prefix) {
  const found = store.sources(guildId).filter(source => source.id.startsWith(prefix));
  if (found.length !== 1) throw new Error(found.length ? 'ID matches more than one source.' : 'Source not found in this server.');
  return found[0];
}

function embedFor(item, source) {
  const embed = new EmbedBuilder().setColor(0xb4443b).setTitle(item.title.slice(0, 256))
    .setDescription((item.summary || 'Open the original update.').slice(0, 2000))
    .setFooter({ text: `${source.name} · Relaydeck` });
  if (item.url?.startsWith('https://')) embed.setURL(item.url);
  const date = Date.parse(item.published);
  if (Number.isFinite(date)) embed.setTimestamp(date);
  return embed;
}

const { pollSource } = createPoller({ store, fetchItems, matches, async deliver(item, source) {
  const channel = await client.channels.fetch(source.channel_id);
  if (!channel?.isTextBased() || !('send' in channel) || channel.guildId !== source.guild_id)
    throw new Error('Destination channel is unavailable.');
  await channel.send({ embeds: [embedFor(item, source)], allowedMentions: { parse: [] } });
} });

async function pollDue() {
  for (const source of store.sources().filter(source => source.enabled)) {
    const due = !source.last_checked || Date.now() - Date.parse(source.last_checked) >= source.interval_minutes * 60_000;
    if (!due) continue;
    try { await pollSource(source); } catch (error) { console.error(`[${source.name}] ${compactError(error)}`); }
  }
}

async function handleSource(interaction) {
  const action = interaction.options.getSubcommand();
  if (action === 'preview') {
    const type = interaction.options.getString('type');
    const value = validateSource(type, interaction.options.getString('value'));
    const items = (await fetchItems({ type, value })).slice(0, 5);
    return interaction.editReply(items.length ? items.map(item => `• **${item.title.replaceAll('*', '')}**\n${item.url}`).join('\n').slice(0, 1900)
      : 'No recent items found.');
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    throw new Error('You need Manage Server to change subscriptions.');
  if (action === 'add') {
    const type = interaction.options.getString('type');
    const value = validateSource(type, interaction.options.getString('value'));
    const channel = interaction.options.getChannel('channel');
    const me = await interaction.guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks])) throw new Error('I need View Channel, Send Messages, and Embed Links there.');
    if (store.sources(interaction.guildId).length >= 100) throw new Error('This server has reached the 100-source limit.');
    const name = (interaction.options.getString('name') || value).trim().slice(0, 80);
    const source = { guildId: interaction.guildId, channelId: channel.id, type, value, name,
      intervalMinutes: interaction.options.getInteger('minutes') || (type === 'x' ? 60 : 10),
      includeWords: (interaction.options.getString('include') || '').slice(0, 200),
      excludeWords: (interaction.options.getString('exclude') || '').slice(0, 200) };
    const id = store.addSource(source);
    try { await pollSource(store.source(id)); } catch (error) {
      return interaction.editReply(`Added **${name}** → ${channel}. Initial check failed: ${compactError(error)}. I'll retry automatically. ID: \`${id.slice(0, 8)}\`.`);
    }
    return interaction.editReply(`Added **${name}** → ${channel}. Recent items were marked as seen, so the channel won't get a backlog. New items will post automatically. ID: \`${id.slice(0, 8)}\`.`);
  }
  if (action === 'list') {
    const sources = store.sources(interaction.guildId);
    return interaction.editReply(sources.length ? sources.map(s => `\`${s.id.slice(0, 8)}\` ${s.enabled ? '●' : '○'} **${s.name}** (${s.type}) → <#${s.channel_id}>${s.last_error ? ` · error: ${s.last_error}` : ''}`).join('\n').slice(0, 1900)
      : 'No sources yet. Use `/source add` to subscribe a channel.');
  }
  const source = sourceForGuild(interaction.guildId, interaction.options.getString('id'));
  if (action === 'update') {
    const channel = interaction.options.getChannel('channel');
    if (channel) {
      const me = await interaction.guild.members.fetchMe();
      if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks])) throw new Error('I need View Channel, Send Messages, and Embed Links there.');
    }
    const words = key => {
      const value = interaction.options.getString(key);
      return value == null ? source[`${key}_words`] : value.trim() === '-' ? '' : value.slice(0, 200);
    };
    store.updateSource(source.id, { channelId: channel?.id || source.channel_id,
      name: (interaction.options.getString('name') || source.name).trim().slice(0, 80),
      intervalMinutes: interaction.options.getInteger('minutes') || source.interval_minutes,
      includeWords: words('include'), excludeWords: words('exclude') });
    return interaction.editReply(`Updated **${source.name}**.`);
  }
  if (action === 'remove') { store.deleteSource(source.id); return interaction.editReply(`Removed **${source.name}**.`); }
  if (action === 'pause' || action === 'resume') {
    store.setEnabled(source.id, action === 'resume');
    return interaction.editReply(`${action === 'pause' ? 'Paused' : 'Resumed'} **${source.name}**.`);
  }
  if (action === 'check') {
    const result = await pollSource(source);
    return interaction.editReply(result.busy ? 'Already checking this source.'
      : `Checked **${source.name}**. ${result.delivered} delivered, ${result.filtered} filtered, ${result.seeded} seeded.`);
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.commandName === 'source') return await handleSource(interaction);
    if (interaction.commandName === 'relay-status') {
      const sources = store.sources(interaction.guildId);
      const entries = store.recent(80).filter(e => e.guild_id === interaction.guildId).slice(0, 5);
      return interaction.editReply(`**Relaydeck** · ${sources.length} sources, ${sources.filter(s => s.enabled).length} active\n`
        + (entries.length ? entries.map(e => `• ${e.status}: ${e.title} (${e.source_name})`).join('\n') : 'No deliveries yet.')
        + `\nLocal dashboard: http://127.0.0.1:${process.env.PORT || 4317}`);
    }
    if (interaction.commandName === 'relay-help') return interaction.editReply(
      '`/source add` RSS/Atom, GitHub releases, or Bluesky → a chosen channel.\n'
      + '`/source preview` inspect updates first. `/source list` shows IDs. X needs `X_BEARER_TOKEN`.\n'
      + '`/source update`, `pause`, `resume`, `check`, `remove` manage subscriptions.\n'
      + '`/relay-status` shows recent deliveries. Existing posts are skipped when a source is added.');
  } catch (error) {
    const message = `Relaydeck: ${compactError(error)}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply(message);
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }
});

client.once('clientReady', async () => {
  console.log(`Relaydeck signed in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    const route = process.env.DISCORD_GUILD_ID
      ? Routes.applicationGuildCommands(clientId, process.env.DISCORD_GUILD_ID)
      : Routes.applicationCommands(clientId);
    await rest.put(route, { body: commands });
    console.log(`Commands registered ${process.env.DISCORD_GUILD_ID ? 'for development server' : 'globally'}.`);
  } catch (error) { console.error(`Command registration failed: ${compactError(error)}`); }
  startDashboard(store, () => ({ bot: client.user.tag, guilds: client.guilds.cache.size }), pollSource);
  await pollDue();
  const timer = setInterval(pollDue, 30_000); timer.unref();
});

client.on('error', error => console.error(`Discord client: ${compactError(error)}`));
process.once('SIGINT', () => { store.close(); client.destroy(); process.exit(0); });
process.once('SIGTERM', () => { store.close(); client.destroy(); process.exit(0); });
client.login(token).catch(error => { console.error(`Login failed: ${compactError(error)}`); process.exitCode = 1; store.close(); });
