# Set up Relaydeck on Windows

Relaydeck has two parts in one Node.js process: a Discord bot and a dashboard at `http://127.0.0.1:4317`. The dashboard starts even when bot credentials have not been entered. All API credentials are managed there.

## 1. Install and start

1. Install [Node.js 24 or newer](https://nodejs.org/).
2. Download or clone Relaydeck, then open a terminal in the downloaded folder.
3. Run `npm install` once, then `npm start`.
4. Open `http://127.0.0.1:4317` on the same computer.

Keep the terminal running while you want updates delivered. The dashboard is local to that computer; it is not a separate website or Vercel app.

## 2. Create a Discord bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Copy its **Application ID** from General Information.
3. Open **Bot**, create the bot if prompted, and copy or reset its token. Treat the token like a password.
4. In OAuth2's URL Generator, select the `bot` and `applications.commands` scopes. Grant **View Channels**, **Send Messages**, and **Embed Links**. Open the generated URL and invite the bot to your server.
5. In Relaydeck's **API settings**, paste the Application ID and bot token, then click **Save settings**. The status at the top changes as it connects.

If you want commands to appear immediately in one server while setting up, enable Discord Developer Mode, copy the server ID, and enter it in the optional **Server ID** field. With no server ID, Relaydeck registers commands globally; Discord may take time to show them. The server ID can be removed later from the dashboard.

Relaydeck needs the `Guilds` gateway intent. It does not need Message Content, Server Members, or Presence intents.

## 3. Add a source in Discord

Use `/source preview` to check a feed first. Then use `/source add` and choose a destination channel. Examples:

| Type | Value |
| --- | --- |
| RSS / Atom | `https://github.blog/feed/` |
| GitHub releases | `nodejs/node` |
| Bluesky | `bsky.app` |
| X | `username` |

The bot marks current items as seen when a source is added. It sends later matching items to the selected channel. Set **include** or **exclude** to comma-separated words or phrases if you want to filter posts. Use `/source list` to find a source ID, then `/source check`, `/source update`, `/source pause`, `/source resume`, or `/source remove`.

You need Discord's **Manage Server** permission to change subscriptions. Relaydeck needs permission to send embeds in the selected channel. It will not post to other channels.

## 4. Optional API tokens

Enter these in the dashboard's **API settings** section. Leave a saved token field blank to keep it. Use **Remove** beside a field to delete it.

- **GitHub token:** raises the rate limit for GitHub release checks. Public repositories can be followed without one.
- **X bearer token:** required for X sources. It must have read access to the official X API. X controls access and pricing, so a saved token does not guarantee that your plan can read posts.

Tokens are stored in `data/relaydeck.sqlite` and are never included in the dashboard's settings response. Keep the `data` folder private and do not commit it. `.gitignore` excludes it. If an old `.env` file contains credentials, Relaydeck imports them once into the database; remove the old file when you no longer need it.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Dashboard does not open | `npm start` must still be running; use `http://127.0.0.1:4317` on the bot computer. |
| Bot stays disconnected | Recheck the Application ID and bot token in API settings. A reset token must be saved again. |
| Slash commands are missing | Check the invite's `applications.commands` scope. A Server ID makes registration immediate for that server. |
| Source has a delivery error | Check the chosen channel still exists and allows the bot to View, Send Messages, and Embed Links. |
| X source returns 401 or 403 | Check the bearer token and the X API plan's read access. |
| GitHub checks are rate limited | Add a GitHub token or increase the source interval. |

The dashboard shows the latest source error and delivery history. `npm test` checks parsing, filtering, persistence, and settings logic without contacting Discord.
