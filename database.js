const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    patreon_id TEXT UNIQUE,
    patreon_email TEXT,
    tier TEXT,
    private_channel_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    verified_at TEXT,
    updated_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  
  CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
  CREATE INDEX IF NOT EXISTS idx_users_patreon_id ON users(patreon_id);
`);

// Clean up old OAuth states (older than 10 minutes)
function cleanupOldStates() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(tenMinutesAgo);
}

// OAuth state management
function createOAuthState(discordId) {
  cleanupOldStates();
  const state = require('crypto').randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO oauth_states (state, discord_id, created_at)
    VALUES (?, ?, ?)
  `).run(state, discordId, new Date().toISOString());
  return state;
}

function getAndDeleteOAuthState(state) {
  const row = db.prepare('SELECT discord_id FROM oauth_states WHERE state = ?').get(state);
  if (row) {
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  }
  return row?.discord_id;
}

// User management
function upsertUser(data) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (discord_id, patreon_id, patreon_email, tier, private_channel_id, access_token, refresh_token, verified_at, updated_at)
    VALUES (@discord_id, @patreon_id, @patreon_email, @tier, @private_channel_id, @access_token, @refresh_token, @verified_at, @updated_at)
    ON CONFLICT(discord_id) DO UPDATE SET
      patreon_id = @patreon_id,
      patreon_email = @patreon_email,
      tier = @tier,
      private_channel_id = COALESCE(@private_channel_id, private_channel_id),
      access_token = @access_token,
      refresh_token = @refresh_token,
      updated_at = @updated_at
  `).run({
    ...data,
    verified_at: data.verified_at || now,
    updated_at: now
  });
}

function getUserByDiscordId(discordId) {
  return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
}

function getUserByPatreonId(patreonId) {
  return db.prepare('SELECT * FROM users WHERE patreon_id = ?').get(patreonId);
}

function getUsersByTier(tier) {
  // Get users with this tier or higher
  if (tier === 'princess') {
    return db.prepare('SELECT * FROM users WHERE tier IN (?, ?, ?)').all('princess', 'part2', 'tailored');
  } else if (tier === 'part2') {
    return db.prepare('SELECT * FROM users WHERE tier IN (?, ?)').all('part2', 'tailored');
  } else if (tier === 'tailored') {
    return db.prepare('SELECT * FROM users WHERE tier = ?').all('tailored');
  }
  return [];
}

function getAllVerifiedUsers() {
  return db.prepare('SELECT * FROM users WHERE tier IS NOT NULL').all();
}

function updateUserChannel(discordId, channelId) {
  db.prepare('UPDATE users SET private_channel_id = ?, updated_at = ? WHERE discord_id = ?')
    .run(channelId, new Date().toISOString(), discordId);
}

function deleteUser(discordId) {
  const user = getUserByDiscordId(discordId);
  db.prepare('DELETE FROM users WHERE discord_id = ?').run(discordId);
  return user;
}

function deleteUserByPatreonId(patreonId) {
  const user = getUserByPatreonId(patreonId);
  if (user) {
    db.prepare('DELETE FROM users WHERE patreon_id = ?').run(patreonId);
  }
  return user;
}

module.exports = {
  createOAuthState,
  getAndDeleteOAuthState,
  upsertUser,
  getUserByDiscordId,
  getUserByPatreonId,
  getUsersByTier,
  getAllVerifiedUsers,
  updateUserChannel,
  deleteUser,
  deleteUserByPatreonId
};
