// Platform integration layer.
// Each function accepts a credentials object and a payload, and returns a
// normalized { ok, data, error } response. If credentials are missing the
// function returns a simulated response so the multi-agent flow still runs
// end-to-end in demo mode. To go live, set the env vars listed in each block
// and the real HTTP call will be made.

const demo = (label, extra = {}) => ({
  ok: true,
  data: { mode: 'demo', label, id: 'demo_' + Math.random().toString(36).slice(2, 10), ...extra }
});

// ── Instagram Graph API (Meta) ───────────────────────────────────────────────
// Requires: IG_USER_ID, META_ACCESS_TOKEN
export async function publishInstagram({ caption, media_url }) {
  const token = process.env.META_ACCESS_TOKEN;
  const igUser = process.env.IG_USER_ID;
  if (!token || !igUser) return demo('instagram_publish', { caption, media_url });

  try {
    const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUser}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: media_url, caption, access_token: token })
    });
    const container = await containerRes.json();
    if (!container.id) return { ok: false, error: container.error?.message || 'Container failed' };

    const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUser}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: container.id, access_token: token })
    });
    const publish = await publishRes.json();
    return { ok: !!publish.id, data: publish, error: publish.error?.message };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── X (Twitter) v2 API ───────────────────────────────────────────────────────
// Requires: X_BEARER_TOKEN (write endpoints need OAuth 1.0a user context —
// production should swap in twitter-api-v2 SDK).
export async function publishTwitter({ text }) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return demo('twitter_publish', { text });
  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    return { ok: res.ok, data, error: data.errors?.[0]?.message };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── TikTok Content Posting API ───────────────────────────────────────────────
// Requires: TIKTOK_ACCESS_TOKEN. Posting video requires multi-step upload —
// demo mode returns a simulated id.
export async function publishTikTok({ caption, video_url }) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) return demo('tiktok_publish', { caption, video_url });
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: { title: caption, privacy_level: 'PUBLIC_TO_EVERYONE' },
        source_info: { source: 'PULL_FROM_URL', video_url }
      })
    });
    const data = await res.json();
    return { ok: res.ok, data, error: data.error?.message };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── LinkedIn UGC Posts ───────────────────────────────────────────────────────
export async function publishLinkedIn({ text }) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const urn = process.env.LINKEDIN_AUTHOR_URN;
  if (!token || !urn) return demo('linkedin_publish', { text });
  try {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        author: urn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
      })
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Meta Ads ─────────────────────────────────────────────────────────────────
// Requires: META_AD_ACCOUNT_ID, META_ACCESS_TOKEN, META_PAGE_ID.
export async function launchMetaAd({ objective, daily_budget, creative_brief, audience }) {
  const token = process.env.META_ACCESS_TOKEN;
  const act = process.env.META_AD_ACCOUNT_ID;
  if (!token || !act) return demo('meta_ad_launch', { objective, daily_budget, audience });

  const objectiveMap = {
    awareness: 'OUTCOME_AWARENESS',
    traffic: 'OUTCOME_TRAFFIC',
    engagement: 'OUTCOME_ENGAGEMENT',
    leads: 'OUTCOME_LEADS',
    sales: 'OUTCOME_SALES'
  };

  try {
    const campRes = await fetch(`https://graph.facebook.com/v21.0/act_${act}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `ORBIT_${objective}_${Date.now()}`,
        objective: objectiveMap[objective] || 'OUTCOME_ENGAGEMENT',
        status: 'PAUSED',
        special_ad_categories: [],
        access_token: token
      })
    });
    const camp = await campRes.json();
    return { ok: !!camp.id, data: { campaign_id: camp.id, creative_brief, daily_budget } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Unified entry points used by the agent tools ────────────────────────────
export async function publishTo(platform, payload) {
  switch (platform) {
    case 'instagram': return publishInstagram(payload);
    case 'twitter':   return publishTwitter({ text: payload.caption });
    case 'tiktok':    return publishTikTok(payload);
    case 'linkedin':  return publishLinkedIn({ text: payload.caption });
    case 'youtube':   return demo('youtube_publish', payload);
    default: return { ok: false, error: `Unsupported platform: ${platform}` };
  }
}

export async function launchAd(platform, payload) {
  switch (platform) {
    case 'meta':        return launchMetaAd(payload);
    case 'tiktok_ads':  return demo('tiktok_ads_launch', payload);
    case 'twitter_ads': return demo('twitter_ads_launch', payload);
    case 'google_ads':  return demo('google_ads_launch', payload);
    default: return { ok: false, error: `Unsupported ad platform: ${platform}` };
  }
}
