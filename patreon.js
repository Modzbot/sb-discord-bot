const axios = require('axios');

const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';
const PATREON_AUTH_URL = 'https://www.patreon.com/oauth2/authorize';
const PATREON_TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';

// Tier name mapping (adjust these to match your actual Patreon tier names)
const TIER_MAPPING = {
  'princess': ['Princess', '🩷 Princess', 'princess'],
  'part2': ['Part 2 Fanatic', '💜 Part 2 Fanatic', 'part2 fanatic', 'Part 2'],
  'tailored': ['Tailored for your weakness', '❤️ Tailored for your weakness', 'tailored', 'Tailored']
};

function getOAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.PATREON_CLIENT_ID,
    redirect_uri: `${process.env.BASE_URL}/callback`,
    scope: 'identity identity[email] identity.memberships',
    state
  });
  return `${PATREON_AUTH_URL}?${params}`;
}

async function exchangeCode(code) {
  const response = await axios.post(PATREON_TOKEN_URL, new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: process.env.PATREON_CLIENT_ID,
    client_secret: process.env.PATREON_CLIENT_SECRET,
    redirect_uri: `${process.env.BASE_URL}/callback`
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return response.data;
}

async function getIdentity(accessToken) {
  const response = await axios.get(`${PATREON_API}/identity`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    params: {
      include: 'memberships,memberships.currently_entitled_tiers',
      'fields[user]': 'email,full_name',
      'fields[member]': 'patron_status,currently_entitled_amount_cents',
      'fields[tier]': 'title'
    }
  });
  return response.data;
}

async function getCampaignMembers() {
  // First get the campaign ID
  const campaignResponse = await axios.get(`${PATREON_API}/campaigns`, {
    headers: { 'Authorization': `Bearer ${process.env.PATREON_CREATOR_TOKEN}` }
  });
  
  const campaignId = campaignResponse.data.data[0]?.id;
  if (!campaignId) throw new Error('No campaign found');

  // Get all members
  const membersResponse = await axios.get(`${PATREON_API}/campaigns/${campaignId}/members`, {
    headers: { 'Authorization': `Bearer ${process.env.PATREON_CREATOR_TOKEN}` },
    params: {
      include: 'currently_entitled_tiers,user',
      'fields[member]': 'patron_status,email',
      'fields[tier]': 'title',
      'fields[user]': 'email,full_name'
    }
  });
  
  return membersResponse.data;
}

function determineTier(identityData) {
  const { data, included } = identityData;
  
  // Find membership and entitled tiers
  const memberships = included?.filter(i => i.type === 'member') || [];
  const tiers = included?.filter(i => i.type === 'tier') || [];
  
  // Get active membership
  const activeMembership = memberships.find(m => 
    m.attributes?.patron_status === 'active_patron'
  );
  
  if (!activeMembership) {
    return null; // Not an active patron
  }
  
  // Get entitled tier IDs
  const entitledTierIds = activeMembership.relationships?.currently_entitled_tiers?.data?.map(t => t.id) || [];
  
  // Get tier names
  const entitledTierNames = tiers
    .filter(t => entitledTierIds.includes(t.id))
    .map(t => t.attributes?.title?.toLowerCase() || '');
  
  console.log('Entitled tiers:', entitledTierNames);
  
  // Determine highest tier (tailored > part2 > princess)
  for (const tierName of entitledTierNames) {
    for (const [tier, aliases] of Object.entries(TIER_MAPPING)) {
      if (aliases.some(alias => tierName.includes(alias.toLowerCase()))) {
        // Return highest tier
        if (tier === 'tailored') return 'tailored';
        if (tier === 'part2' && !entitledTierNames.some(t => 
          TIER_MAPPING.tailored.some(a => t.includes(a.toLowerCase()))
        )) return 'part2';
        if (tier === 'princess' && !entitledTierNames.some(t => 
          TIER_MAPPING.part2.some(a => t.includes(a.toLowerCase())) ||
          TIER_MAPPING.tailored.some(a => t.includes(a.toLowerCase()))
        )) return 'princess';
      }
    }
  }
  
  // Fallback: check by amount (if tiers aren't properly named)
  const amountCents = activeMembership.attributes?.currently_entitled_amount_cents || 0;
  if (amountCents >= 2500) return 'tailored';  // $25+
  if (amountCents >= 1500) return 'part2';      // $15+
  if (amountCents >= 500) return 'princess';    // $5+
  
  return null;
}

function getUserInfo(identityData) {
  return {
    id: identityData.data.id,
    email: identityData.data.attributes?.email
  };
}

module.exports = {
  getOAuthUrl,
  exchangeCode,
  getIdentity,
  getCampaignMembers,
  determineTier,
  getUserInfo,
  TIER_MAPPING
};
