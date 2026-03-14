# SB's Discord Bot

Discord bot for Patreon subscriber community with tier-based private channels.

## Features

- 🔐 **Patreon OAuth Verification** - Users verify their Patreon subscription via `/verify`
- 🎭 **Tier-based Roles** - Automatic role assignment based on subscription tier
- 🔒 **Private Channels** - Each verified user gets their own private channel
- 📤 **Broadcast System** - Admin posts in upload channels automatically distribute to eligible members
- 🔄 **Webhook Integration** - Automatic access removal when users unsubscribe

## Tier Structure

| Tier | Role | Access |
|------|------|--------|
| 🩷 Princess | Pink | Princess content only |
| 💜 Part 2 Fanatic | Purple | Princess + Part 2 content |
| ❤️ Tailored | Red | All content |

## Setup

### 1. Environment Variables

Copy `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `DISCORD_TOKEN` - Your Discord bot token
- `GUILD_ID` - Your Discord server ID
- `PATREON_CLIENT_ID` - From Patreon developer portal
- `PATREON_CLIENT_SECRET` - From Patreon developer portal
- `PATREON_CREATOR_TOKEN` - Your creator access token
- `BASE_URL` - Public URL for OAuth callback (e.g., `https://your-app.railway.app`)

### 2. Patreon Setup

1. Go to [Patreon Developer Portal](https://www.patreon.com/portal/registration/register-clients)
2. Create a new client
3. Set redirect URI to `{BASE_URL}/callback`
4. Copy Client ID and Secret to `.env`
5. (Optional) Set up webhooks pointing to `{BASE_URL}/webhook/patreon`

### 3. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create new application
3. Go to Bot → Create Bot
4. Enable these Privileged Gateway Intents:
   - SERVER MEMBERS INTENT
   - MESSAGE CONTENT INTENT
5. Copy bot token to `.env`
6. Invite bot with this URL (replace CLIENT_ID):
   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```

### 4. Run Locally

```bash
npm install
npm start
```

### 5. Deploy to Railway

1. Push to GitHub
2. Create new project on Railway
3. Connect repository
4. Add environment variables
5. Deploy!

## Commands

| Command | Description |
|---------|-------------|
| `/verify` | Start Patreon verification |
| `/status` | Check your verification status |
| `/refresh` | Update your tier if it changed |

## Admin Channels

Post content in these channels to broadcast:

- `#princess-uploads` → All Princess+ members
- `#part2-uploads` → Part 2 Fanatic+ members
- `#tailored-uploads` → Tailored members only

## API Endpoints

- `GET /callback` - Patreon OAuth callback
- `POST /webhook/patreon` - Patreon webhook receiver
- `GET /health` - Health check

## Privacy Features

- Users cannot see member list
- Users cannot see other users' private channels
- Each user only sees their own content channel
# Trigger deploy Sat Mar 14 09:37:53 UTC 2026
# Deploy Sat Mar 14 09:38:31 UTC 2026
