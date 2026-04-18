// Direct action endpoint: ask PULSE for an ad plan then launch it on the
// specified ad platform. Returns both the strategy and the launch receipt.

import { AGENTS, SPECIALIST_MODEL } from './lib/agents.js';
import { askSpecialist } from './lib/claude.js';
import { launchAd } from './lib/platforms.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const {
    platform = 'meta',
    objective = 'engagement',
    daily_budget = 20,
    niche = 'lifestyle',
    goal = 'grow audience',
    launch = false
  } = req.body || {};

  try {
    const { json, raw } = await askSpecialist({
      model: SPECIALIST_MODEL,
      system: AGENTS.PULSE.systemPrompt({ platform, niche, goal, budget: daily_budget * 30 }),
      prompt: `Design a ${objective} campaign at $${daily_budget}/day. Return JSON only.`
    });
    const plan = json || { raw };

    if (!launch) return res.status(200).json({ plan, launched: false });

    const result = await launchAd(platform, {
      objective,
      daily_budget,
      creative_brief: plan.creative_brief || '',
      audience: plan.audience || {}
    });
    return res.status(200).json({ plan, launched: result.ok, result });
  } catch (err) {
    console.error('ads endpoint error', err);
    return res.status(500).json({ error: err.message });
  }
}
