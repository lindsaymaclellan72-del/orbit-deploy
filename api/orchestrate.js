// ECHO orchestrator endpoint.
// Runs a tool-use loop with Claude: ECHO picks tools → we execute them
// (which may delegate to NOVA/VIBE/FLUX/PULSE or hit platform APIs) →
// results are fed back in until ECHO produces a final text reply.

import { AGENTS, ORCHESTRATOR_TOOLS, ORCHESTRATOR_MODEL, SPECIALIST_MODEL } from './lib/agents.js';
import { callClaude, askSpecialist } from './lib/claude.js';
import { publishTo, launchAd } from './lib/platforms.js';
import { savePost, getPost, scheduleJob, listPosts, listJobs } from './lib/store.js';

const MAX_TOOL_ITERATIONS = 6;

// ── Tool implementations — each returns JSON-serializable content ──────────

async function runPlanCampaign(input, ctx) {
  const { theme, duration_days } = input;
  const { json, raw } = await askSpecialist({
    model: SPECIALIST_MODEL,
    system: AGENTS.NOVA.systemPrompt(ctx),
    prompt: `Build a ${duration_days}-day plan${theme ? ` around "${theme}"` : ''}. Return JSON only.`
  });
  return { agent: 'NOVA', plan: json || { raw } };
}

async function runCreatePost(input, ctx) {
  const { platform, format, topic, pillar } = input;
  const { json, raw } = await askSpecialist({
    model: SPECIALIST_MODEL,
    system: AGENTS.VIBE.systemPrompt({ ...ctx, platform }),
    prompt: `Create a ${format} for ${platform} about "${topic}"${pillar ? ` (pillar: ${pillar})` : ''}. Return JSON only.`
  });
  const post = json || { caption: raw };
  const stored = savePost({ ...post, platform, format, topic, pillar, status: 'draft' });
  return { agent: 'VIBE', post: stored };
}

async function runSchedulePost(input) {
  const { platform, post_id, publish_at } = input;
  const post = getPost(post_id);
  if (!post) return { error: `Unknown post_id ${post_id}` };
  const job = scheduleJob({ kind: 'publish', platform, post_id, publish_at, post });
  return { scheduled: true, job };
}

async function runPublishPost(input) {
  const { platform, post_id } = input;
  const post = getPost(post_id);
  if (!post) return { error: `Unknown post_id ${post_id}` };
  const result = await publishTo(platform, {
    caption: post.caption,
    media_url: post.media_url || null,
    video_url: post.video_url || null
  });
  return { published: result.ok, result };
}

async function runAnalyzePerformance(input, ctx) {
  const { platform, window_days } = input;
  const mockMetrics = ctx.metrics || {
    platform,
    window_days,
    followers_delta: 312,
    reach: 48210,
    engagement_rate: 0.034,
    top_post: { format: 'reel', topic: 'behind the scenes', views: 22400 },
    bottom_post: { format: 'static', topic: 'product shot', views: 840 }
  };
  const { json, raw } = await askSpecialist({
    model: SPECIALIST_MODEL,
    system: AGENTS.FLUX.systemPrompt(ctx),
    prompt: `Analyze these metrics and return JSON only:\n${JSON.stringify(mockMetrics)}`
  });
  return { agent: 'FLUX', analysis: json || { raw }, metrics: mockMetrics };
}

async function runLaunchAdCampaign(input, ctx) {
  const { platform, objective, daily_budget, post_id } = input;
  const { json, raw } = await askSpecialist({
    model: SPECIALIST_MODEL,
    system: AGENTS.PULSE.systemPrompt({ ...ctx, budget: daily_budget * 30 }),
    prompt: `Design a ${objective} campaign at $${daily_budget}/day on ${platform}. Return JSON only.`
  });
  const plan = json || { raw };
  const post = post_id ? getPost(post_id) : null;
  const launch = await launchAd(platform, {
    objective,
    daily_budget,
    creative_brief: plan.creative_brief || post?.caption || '',
    audience: plan.audience || {}
  });
  return { agent: 'PULSE', plan, launch };
}

function runRequestApproval(input) {
  return { awaiting_user: true, summary: input.summary, action: input.action };
}

async function dispatchTool(name, input, ctx) {
  switch (name) {
    case 'plan_campaign':       return runPlanCampaign(input, ctx);
    case 'create_post':         return runCreatePost(input, ctx);
    case 'schedule_post':       return runSchedulePost(input);
    case 'publish_post':        return runPublishPost(input);
    case 'analyze_performance': return runAnalyzePerformance(input, ctx);
    case 'launch_ad_campaign':  return runLaunchAdCampaign(input, ctx);
    case 'request_approval':    return runRequestApproval(input);
    default: return { error: `Unknown tool ${name}` };
  }
}

// ── HTTP handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { message, profile = {}, history = [] } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing message' });
  }

  const ctx = {
    name: profile.name || 'Creator',
    niche: profile.niche || 'lifestyle',
    platform: profile.platform || 'instagram',
    goal: profile.goal || 'grow audience',
    budget: profile.budget || 0
  };

  const messages = [
    ...history.slice(-10).filter(m => m.role === 'user' || m.role === 'assistant'),
    { role: 'user', content: message }
  ];

  const trace = [];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const result = await callClaude({
        model: ORCHESTRATOR_MODEL,
        system: AGENTS.ECHO.systemPrompt(ctx),
        messages,
        tools: ORCHESTRATOR_TOOLS,
        max_tokens: 1500
      });

      messages.push({ role: 'assistant', content: result.content });

      if (result.stop_reason !== 'tool_use') {
        const text = result.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        return res.status(200).json({
          reply: text || '(no reply)',
          trace,
          posts: listPosts(),
          jobs: listJobs()
        });
      }

      const toolUses = result.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const tu of toolUses) {
        const output = await dispatchTool(tu.name, tu.input, ctx);
        trace.push({ tool: tu.name, input: tu.input, output });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(output).slice(0, 6000)
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return res.status(200).json({
      reply: 'Stopped after tool iteration limit. Check the trace for details.',
      trace, posts: listPosts(), jobs: listJobs()
    });
  } catch (err) {
    console.error('Orchestrator error:', err);
    return res.status(500).json({ error: err.message, trace });
  }
}
