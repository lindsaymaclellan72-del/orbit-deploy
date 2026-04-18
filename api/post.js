// Direct action endpoint: create + optionally publish a single post in one shot.
// Used by the dashboard "Post Now" button and by external webhooks.

import { AGENTS, SPECIALIST_MODEL } from './lib/agents.js';
import { askSpecialist } from './lib/claude.js';
import { publishTo } from './lib/platforms.js';
import { savePost } from './lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const {
    platform = 'instagram',
    format = 'static',
    topic,
    niche = 'lifestyle',
    publish = false,
    media_url
  } = req.body || {};

  if (!topic) return res.status(400).json({ error: 'topic is required' });

  try {
    const { json, raw } = await askSpecialist({
      model: SPECIALIST_MODEL,
      system: AGENTS.VIBE.systemPrompt({ platform, niche }),
      prompt: `Create a ${format} for ${platform} about "${topic}". Return JSON only.`
    });
    const post = savePost({
      ...(json || { caption: raw }),
      platform, format, topic, niche,
      media_url: media_url || null,
      status: publish ? 'publishing' : 'draft'
    });

    if (!publish) return res.status(200).json({ post });

    const result = await publishTo(platform, {
      caption: post.caption,
      media_url: post.media_url
    });
    post.status = result.ok ? 'published' : 'failed';
    post.platform_response = result.data || result.error;
    return res.status(200).json({ post, result });
  } catch (err) {
    console.error('post endpoint error', err);
    return res.status(500).json({ error: err.message });
  }
}
