require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const db = require('./database');
const patreon = require('./patreon');

// Role and channel IDs (will be set up or fetched on startup)
let ROLES = {
  princess: null,
  part2: null,
  tailored: null,
  verified: null
};

let CHANNELS = {
  announcements: null,
  princessUploads: null,
  part2Uploads: null,
  tailoredUploads: null,
  verification: null
};

let CATEGORY_ID = null;
let TAILORED_CATEGORY_ID = null;

// Create Discord client with invisible presence
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message],
  presence: {
    status: 'invisible' // Hide bot from member list
  }
});

// Express server for OAuth callback and webhooks
const app = express();
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ============ DISCORD SETUP ============

async function setupGuild() {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.error('Guild not found!');
    return;
  }

  console.log(`Connected to guild: ${guild.name}`);

  // Create or find roles
  ROLES.princess = guild.roles.cache.find(r => r.name === '🩷 Princess') ||
    await guild.roles.create({
      name: '🩷 Princess',
      color: 0xFF69B4,
      reason: 'Patreon tier role'
    });

  ROLES.part2 = guild.roles.cache.find(r => r.name === '💜 Part 2 Fanatic') ||
    await guild.roles.create({
      name: '💜 Part 2 Fanatic',
      color: 0x8A2BE2,
      reason: 'Patreon tier role'
    });

  ROLES.tailored = guild.roles.cache.find(r => r.name === '❤️ Tailored') ||
    await guild.roles.create({
      name: '❤️ Tailored',
      color: 0xFF0000,
      reason: 'Patreon tier role'
    });

  ROLES.verified = guild.roles.cache.find(r => r.name === '✓ Verified') ||
    await guild.roles.create({
      name: '✓ Verified',
      color: 0x00FF00,
      reason: 'Verified Patreon subscriber'
    });

  console.log('Roles ready:', Object.keys(ROLES).map(k => ROLES[k]?.name));

  // Create or find category for private channels
  let category = guild.channels.cache.find(c => c.name === 'Private Channels' && c.type === ChannelType.GuildCategory);
  if (!category) {
    category = await guild.channels.create({
      name: 'Private Channels',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        }
      ]
    });
  }
  CATEGORY_ID = category.id;

  // Create or find category for Tailored private channels
  let tailoredCategory = guild.channels.cache.find(c => c.name === '💜 Tailored Members' && c.type === ChannelType.GuildCategory);
  if (!tailoredCategory) {
    tailoredCategory = await guild.channels.create({
      name: '💜 Tailored Members',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        }
      ]
    });
  }
  TAILORED_CATEGORY_ID = tailoredCategory.id;

  // Create or find admin upload channels
  let adminCategory = guild.channels.cache.find(c => c.name === 'Admin Uploads' && c.type === ChannelType.GuildCategory);
  if (!adminCategory) {
    adminCategory = await guild.channels.create({
      name: 'Admin Uploads',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        }
      ]
    });
  }

  CHANNELS.princessUploads = guild.channels.cache.find(c => c.name === 'princess-uploads') ||
    await guild.channels.create({
      name: 'princess-uploads',
      type: ChannelType.GuildText,
      parent: adminCategory.id,
      topic: 'Post here to broadcast to all Princess+ members'
    });

  CHANNELS.part2Uploads = guild.channels.cache.find(c => c.name === 'part2-uploads') ||
    await guild.channels.create({
      name: 'part2-uploads',
      type: ChannelType.GuildText,
      parent: adminCategory.id,
      topic: 'Post here to broadcast to Part 2 Fanatic+ members'
    });

  CHANNELS.tailoredUploads = guild.channels.cache.find(c => c.name === 'tailored-uploads') ||
    await guild.channels.create({
      name: 'tailored-uploads',
      type: ChannelType.GuildText,
      parent: adminCategory.id,
      topic: 'Post here to broadcast to Tailored members only'
    });

  // Create or find announcements channel
  CHANNELS.announcements = guild.channels.cache.find(c => c.name === '📢announcements') ||
    await guild.channels.create({
      name: '📢announcements',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: ROLES.verified.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages]
        }
      ]
    });

  // Create or find verification channel with proper permissions
  CHANNELS.verification = guild.channels.cache.find(c => c.name === 'verification' || c.name === '✅-verification');
  if (!CHANNELS.verification) {
    CHANNELS.verification = await guild.channels.create({
      name: '✅-verification',
      type: ChannelType.GuildText,
      topic: 'Verify your Patreon subscription to access exclusive content',
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.UseApplicationCommands],
          deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
        }
      ]
    });
  } else {
    // Ensure @everyone has USE_APPLICATION_COMMANDS in existing verification channel
    await CHANNELS.verification.permissionOverwrites.edit(guild.id, {
      ViewChannel: true,
      UseApplicationCommands: true,
      SendMessages: false,
      AddReactions: false
    });
  }

  console.log('Channels ready');

  // Register slash commands
  await registerCommands();

  // Send/update verification welcome message with button
  await setupVerificationMessage(guild);
}

async function setupVerificationMessage(guild) {
  if (!CHANNELS.verification) return;

  const embed = new EmbedBuilder()
    .setTitle('🔐 Patreon Verification')
    .setDescription(
      '**Welcome to the community!**\n\n' +
      'Click the button below to verify your Patreon subscription and unlock exclusive content.\n\n' +
      '• Connect your Patreon account\n' +
      '• Get your tier role automatically\n' +
      '• Access your private channel\n\n' +
      '*Make sure you have an active Patreon subscription before verifying.*'
    )
    .setColor(0xFF424D)
    .setFooter({ text: 'Your Patreon tier determines your access level' });

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('verify_patreon')
        .setLabel('🔗 Verify with Patreon')
        .setStyle(ButtonStyle.Primary)
    );

  // Check if we already have a verification message
  const messages = await CHANNELS.verification.messages.fetch({ limit: 10 });
  const botMessage = messages.find(m => m.author.id === client.user.id && m.components.length > 0);

  if (botMessage) {
    // Update existing message
    await botMessage.edit({ embeds: [embed], components: [row] });
    console.log('Updated verification message');
  } else {
    // Send new message
    await CHANNELS.verification.send({ embeds: [embed], components: [row] });
    console.log('Sent new verification message');
  }
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Verify your Patreon subscription to access exclusive content'),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Check your verification status'),
    new SlashCommandBuilder()
      .setName('refresh')
      .setDescription('Refresh your Patreon tier (if it changed)')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// ============ VERIFICATION FLOW ============

async function createPrivateChannel(guild, member, tier) {
  // Tailored users go in the separate Tailored category, others go in Private Channels
  const categoryId = tier === 'tailored' ? TAILORED_CATEGORY_ID : CATEGORY_ID;
  
  const channel = await guild.channels.create({
    name: `${member.user.username}-private`,
    type: ChannelType.GuildText,
    parent: categoryId,
    nsfw: true, // Age-restricted by default
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
      },
      {
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
      }
    ]
  });

  // Send welcome message
  const tierEmojis = { princess: '🩷', part2: '💜', tailored: '❤️' };
  const tierNames = { princess: 'Princess', part2: 'Part 2 Fanatic', tailored: 'Tailored' };
  
  const embed = new EmbedBuilder()
    .setTitle(`Welcome, ${member.user.username}! ${tierEmojis[tier]}`)
    .setDescription(`Thank you for being a **${tierNames[tier]}** subscriber!\n\nThis is your private channel where you'll receive exclusive content based on your tier.`)
    .setColor(tier === 'princess' ? 0xFF69B4 : tier === 'part2' ? 0x8A2BE2 : 0xFF0000)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  
  return channel;
}

async function assignTierRole(member, tier) {
  const guild = member.guild;
  
  // Remove all tier roles first
  const allTierRoles = [ROLES.princess, ROLES.part2, ROLES.tailored].filter(Boolean);
  for (const role of allTierRoles) {
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
    }
  }

  // Add verified role
  if (ROLES.verified && !member.roles.cache.has(ROLES.verified.id)) {
    await member.roles.add(ROLES.verified);
  }

  // Add appropriate tier role
  const roleKey = tier;
  if (ROLES[roleKey]) {
    await member.roles.add(ROLES[roleKey]);
  }
}

async function verifyUser(discordId, tokens, identityData) {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return { success: false, error: 'Guild not found' };

  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return { success: false, error: 'Member not found in server' };

  const tier = patreon.determineTier(identityData);
  if (!tier) return { success: false, error: 'No active Patreon subscription found' };

  const userInfo = patreon.getUserInfo(identityData);
  
  // Check if user already verified
  const existingUser = db.getUserByDiscordId(discordId);
  
  // Update database
  db.upsertUser({
    discord_id: discordId,
    patreon_id: userInfo.id,
    patreon_email: userInfo.email,
    tier,
    private_channel_id: existingUser?.private_channel_id || null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token
  });

  // Assign role
  await assignTierRole(member, tier);

  // Set anonymous nickname (Member-XXXX format)
  try {
    const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number: 1000-9999
    const anonymousNickname = `Member-${randomNum}`;
    await member.setNickname(anonymousNickname);
    console.log(`Set nickname for ${member.user.username} to ${anonymousNickname}`);
  } catch (nicknameError) {
    // Gracefully handle cases where nickname can't be set (server owner, higher role, etc.)
    console.log(`Could not set nickname for ${member.user.username}: ${nicknameError.message}`);
  }

  // Create private channel if not exists
  let channelId = existingUser?.private_channel_id;
  if (!channelId) {
    const channel = await createPrivateChannel(guild, member, tier);
    channelId = channel.id;
    db.updateUserChannel(discordId, channelId);
  }

  return { success: true, tier };
}

// ============ BROADCAST SYSTEM ============

async function broadcastMessage(message, targetTier) {
  const users = db.getUsersByTier(targetTier);
  const guild = message.guild;
  
  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    if (!user.private_channel_id) continue;
    
    try {
      const channel = await guild.channels.fetch(user.private_channel_id).catch(() => null);
      if (!channel) {
        failCount++;
        continue;
      }

      // Forward message content
      const embed = new EmbedBuilder()
        .setDescription(message.content || '')
        .setColor(targetTier === 'princess' ? 0xFF69B4 : targetTier === 'part2' ? 0x8A2BE2 : 0xFF0000)
        .setTimestamp()
        .setFooter({ text: `From: ${message.author.username}` });

      // Handle attachments
      const attachments = [...message.attachments.values()];
      
      if (attachments.length > 0) {
        await channel.send({ 
          embeds: message.content ? [embed] : [],
          files: attachments.map(a => a.url)
        });
      } else if (message.content) {
        await channel.send({ embeds: [embed] });
      }
      
      successCount++;
    } catch (error) {
      console.error(`Failed to send to ${user.discord_id}:`, error.message);
      failCount++;
    }
  }

  return { success: successCount, failed: failCount };
}

// ============ EVENT HANDLERS ============

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  await setupGuild();
});

client.on('interactionCreate', async (interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    if (interaction.customId === 'verify_patreon') {
      const state = db.createOAuthState(interaction.user.id);
      const oauthUrl = patreon.getOAuthUrl(state);

      const embed = new EmbedBuilder()
        .setTitle('🔐 Patreon Verification')
        .setDescription('Click the button below to connect your Patreon account and verify your subscription!')
        .setColor(0xFF424D);

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Connect Patreon')
            .setStyle(ButtonStyle.Link)
            .setURL(oauthUrl)
            .setEmoji('🔗')
        );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'verify') {
    const state = db.createOAuthState(interaction.user.id);
    const oauthUrl = patreon.getOAuthUrl(state);

    const embed = new EmbedBuilder()
      .setTitle('🔐 Patreon Verification')
      .setDescription('Click the button below to verify your Patreon subscription and unlock exclusive content!')
      .setColor(0xFF424D);

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Connect Patreon')
          .setStyle(ButtonStyle.Link)
          .setURL(oauthUrl)
          .setEmoji('🔗')
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  if (commandName === 'status') {
    const user = db.getUserByDiscordId(interaction.user.id);
    
    if (!user || !user.tier) {
      await interaction.reply({ 
        content: '❌ You are not verified. Use `/verify` to connect your Patreon.',
        ephemeral: true 
      });
      return;
    }

    const tierEmojis = { princess: '🩷', part2: '💜', tailored: '❤️' };
    const tierNames = { princess: 'Princess', part2: 'Part 2 Fanatic', tailored: 'Tailored' };

    const embed = new EmbedBuilder()
      .setTitle('✅ Verification Status')
      .addFields(
        { name: 'Tier', value: `${tierEmojis[user.tier]} ${tierNames[user.tier]}`, inline: true },
        { name: 'Verified Since', value: new Date(user.verified_at).toLocaleDateString(), inline: true }
      )
      .setColor(user.tier === 'princess' ? 0xFF69B4 : user.tier === 'part2' ? 0x8A2BE2 : 0xFF0000);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'refresh') {
    const user = db.getUserByDiscordId(interaction.user.id);
    
    if (!user || !user.access_token) {
      await interaction.reply({ 
        content: '❌ You need to verify first. Use `/verify` to connect your Patreon.',
        ephemeral: true 
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const identityData = await patreon.getIdentity(user.access_token);
      const newTier = patreon.determineTier(identityData);

      if (!newTier) {
        await interaction.editReply('❌ No active Patreon subscription found.');
        return;
      }

      if (newTier !== user.tier) {
        db.upsertUser({ ...user, tier: newTier });
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await assignTierRole(member, newTier);
        
        const tierNames = { princess: 'Princess', part2: 'Part 2 Fanatic', tailored: 'Tailored' };
        await interaction.editReply(`✅ Your tier has been updated to **${tierNames[newTier]}**!`);
      } else {
        await interaction.editReply('✅ Your tier is already up to date!');
      }
    } catch (error) {
      console.error('Refresh error:', error);
      await interaction.editReply('❌ Failed to refresh. Try `/verify` again.');
    }
  }
});

// Broadcast system - watch admin upload channels
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const channelId = message.channel.id;
  
  let targetTier = null;
  if (CHANNELS.princessUploads && channelId === CHANNELS.princessUploads.id) {
    targetTier = 'princess';
  } else if (CHANNELS.part2Uploads && channelId === CHANNELS.part2Uploads.id) {
    targetTier = 'part2';
  } else if (CHANNELS.tailoredUploads && channelId === CHANNELS.tailoredUploads.id) {
    targetTier = 'tailored';
  }

  if (targetTier) {
    const result = await broadcastMessage(message, targetTier);
    await message.react('✅');
    await message.reply({ 
      content: `📤 Broadcast sent to ${result.success} members (${result.failed} failed)`,
      allowedMentions: { repliedUser: false }
    });
  }
});

// ============ EXPRESS ROUTES ============

// OAuth callback
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  const discordId = db.getAndDeleteOAuthState(state);
  if (!discordId) {
    return res.status(400).send('Invalid or expired state. Please try /verify again.');
  }

  try {
    const tokens = await patreon.exchangeCode(code);
    const identityData = await patreon.getIdentity(tokens.access_token);
    
    const result = await verifyUser(discordId, tokens, identityData);
    
    if (result.success) {
      const tierNames = { princess: '🩷 Princess', part2: '💜 Part 2 Fanatic', tailored: '❤️ Tailored' };
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Verification Successful!</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   display: flex; justify-content: center; align-items: center; height: 100vh;
                   background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; }
            .card { background: white; padding: 40px; border-radius: 16px; text-align: center; 
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2); max-width: 400px; }
            h1 { color: #22c55e; margin-bottom: 16px; }
            p { color: #666; line-height: 1.6; }
            .tier { font-size: 24px; font-weight: bold; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✅ Verification Successful!</h1>
            <p>Welcome to the community!</p>
            <div class="tier">${tierNames[result.tier]}</div>
            <p>You can close this window and return to Discord.<br>Check out your new private channel!</p>
          </div>
        </body>
        </html>
      `);
    } else {
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Verification Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   display: flex; justify-content: center; align-items: center; height: 100vh;
                   background: linear-gradient(135deg, #f43f5e 0%, #ec4899 100%); margin: 0; }
            .card { background: white; padding: 40px; border-radius: 16px; text-align: center; 
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2); max-width: 400px; }
            h1 { color: #ef4444; margin-bottom: 16px; }
            p { color: #666; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>❌ Verification Failed</h1>
            <p>${result.error}</p>
            <p>Please make sure you have an active Patreon subscription and try again.</p>
          </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send('Verification failed. Please try again.');
  }
});

// Patreon webhook for member updates
app.post('/webhook/patreon', async (req, res) => {
  const event = req.headers['x-patreon-event'];
  const signature = req.headers['x-patreon-signature'];
  
  // Verify signature if webhook secret is set
  if (process.env.PATREON_WEBHOOK_SECRET && process.env.PATREON_WEBHOOK_SECRET !== 'your-webhook-secret-here') {
    const crypto = require('crypto');
    const expectedSig = crypto
      .createHmac('md5', process.env.PATREON_WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest('hex');
    
    if (signature !== expectedSig) {
      console.log('Invalid webhook signature');
      return res.status(401).send('Invalid signature');
    }
  }

  console.log('Patreon webhook:', event);

  try {
    const { data, included } = req.body;
    const patronId = data?.relationships?.user?.data?.id;
    
    if (event === 'members:pledge:delete' || event === 'members:delete' || event === 'pledges:delete') {
      // User unsubscribed - remove their access
      if (patronId) {
        const user = db.deleteUserByPatreonId(patronId);
        
        if (user) {
          const guild = client.guilds.cache.get(process.env.GUILD_ID);
          if (guild) {
            // Delete private channel
            if (user.private_channel_id) {
              const channel = await guild.channels.fetch(user.private_channel_id).catch(() => null);
              if (channel) {
                await channel.delete('Patreon subscription ended');
              }
            }
            
            // Remove roles
            const member = await guild.members.fetch(user.discord_id).catch(() => null);
            if (member) {
              const allRoles = [ROLES.princess, ROLES.part2, ROLES.tailored, ROLES.verified].filter(Boolean);
              for (const role of allRoles) {
                if (member.roles.cache.has(role.id)) {
                  await member.roles.remove(role);
                }
              }
            }
          }
          console.log(`Removed access for user ${user.discord_id}`);
        }
      }
    } else if (event === 'members:pledge:update') {
      // Tier changed - update their access
      // This would need the full identity data which webhooks don't provide
      // User should use /refresh command
      console.log('Tier update webhook received - user should use /refresh');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: client.user?.tag || 'not connected' });
});

// ============ START ============

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
