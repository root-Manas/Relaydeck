# Relaydeck

Relaydeck is a **Discord bot** that polls feeds and posts new items to specific channels. It supports RSS/Atom, GitHub releases, Bluesky, and X with your own API access. It was rebuilt from Tweecord, the earlier Twitter-to-Discord experiment.

![Relaydeck local dashboard with sample data](public/preview.png)

## What it supports

| Source | Input | Access |
| --- | --- | --- |
| RSS / Atom | `https://example.com/feed.xml` | Public HTTPS feed |
| GitHub releases | `owner/repository` | Public API; optional token in dashboard |
| Bluesky posts | `handle.bsky.social` | Public API |
| X posts | `username` | Your bearer token with read access, saved in dashboard |

Many sites, including some Mastodon profiles and YouTube channels, provide RSS feeds. Add those as RSS sources. X is read through the official API; Relaydeck does not scrape accounts or promise free access to X posts.

For each source you can choose a channel, polling interval, include and exclude words, and a label. New subscriptions mark existing items as seen so a channel does not receive a backlog. Failed deliveries remain visible and are retried on a later check. The bot never needs the Message Content privileged intent.

## Set up the bot

For screenshots and troubleshooting, see the [Windows setup guide](docs/SETUP.md).

1. Install **Node.js 24 or newer** and run `npm install` in this folder.
2. Create an application and bot in the [Discord Developer Portal](https://discord.com/developers/applications). Copy its bot token and application ID.
3. Invite it to your server with the `bot` and `applications.commands` scopes. Give it **View Channel**, **Send Messages**, and **Embed Links** in channels where it should post.
4. Run `npm start` and open `http://127.0.0.1:4317` on that computer. The dashboard starts before the bot connects.
5. In **API settings**, enter the bot token and application ID. You can also enter one server ID so slash commands update immediately in that server. Without a server ID, commands are registered globally and can take time to appear.
6. Add a GitHub token if you need a higher API rate limit. Add an X bearer token if you want to follow X accounts. These credentials are entered and changed only in the dashboard.

The SQLite database in `data/` holds subscriptions and credentials and is ignored by Git. Keep that database private. Saved tokens are not returned to the browser after you save them. The dashboard listens on loopback only and is intended for the computer running the bot. If you already used a `.env` file with credentials, Relaydeck imports those values into the database on first start.

## Commands

- `/source preview type value` — inspect recent items before subscribing.
- `/source add type value channel [name] [include] [exclude] [minutes]` — subscribe a channel. You need **Manage Server**.
- `/source list` — list source IDs, channels, and errors.
- `/source update id [channel] [name] [include] [exclude] [minutes]` — edit a subscription without losing its history. Use `-` to clear a filter.
- `/source check id` — poll immediately.
- `/source pause id`, `/source resume id`, `/source remove id` — manage a source.
- `/relay-status` — see active sources and recent deliveries.
- `/relay-help` — show help in Discord.

Use a full ID or its unique first characters from `/source list`. Include and exclude are comma-separated phrases. Include matches when **any** phrase appears in the title or summary; exclude wins if **any** phrase appears. The default interval is 10 minutes, or 60 minutes for X. The allowed range is 5–1440 minutes.

The local dashboard manages API credentials and shows source health, recent deliveries, errors, and a **Check now** action. Subscription changes happen in Discord so server permissions are respected.

## Reliability and limits

- SQLite stores sources and item IDs across restarts. One process should use the database at a time.
- Each check processes up to 10 unseen items; older items are seeded on first use. Duplicate IDs are never reposted after a successful delivery.
- Discord delivery uses embeds with mentions disabled. A missing channel or permission error is recorded instead of silently sending elsewhere.
- RSS feeds must use public HTTPS URLs. The fetcher rejects local network addresses, limits redirects, response size, and request time.
- GitHub and Bluesky have their own rate limits. X API access and pricing are controlled by X; configure a longer interval if needed.
- The local dashboard runs on the bot computer. It is not a hosted web service and does not need a separate Vercel deployment.

Run `npm test` for parsing, filtering, validation, and persistence checks.
Run `npm run preview` to inspect the dashboard with sample data without a Discord token.

## Built with

Node.js, [discord.js](https://discord.js.org/), [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser), and Node's built-in SQLite module. The local dashboard uses plain HTML, CSS, and JavaScript.

## License

The current code is licensed under [MIT](LICENSE). Earlier Tweecord revisions were published under CC0-1.0.
