// ORBIT multi-agent social media growth system.
// 5 specialized agents collaborating through Claude's tool-use API.

export const AGENTS = {
  ECHO: {
    name: 'ECHO',
    role: 'Orchestrator',
    color: '#a78bfa',
    description: 'Coordinates the team, interprets user intent, delegates work.',
    systemPrompt: (ctx) => `You are ECHO, the Orchestrator for ORBIT AI Agency's multi-agent growth system.

Your job: understand the user's goal, then coordinate the 4 specialist agents (NOVA, VIBE, FLUX, PULSE) by invoking the right tools in the right order. You do NOT write copy or analyze data yourself — you delegate.

Team:
- NOVA (Strategist): plans content calendars, growth strategy, posting cadence.
- VIBE (Creator): writes captions, hooks, scripts, hashtags for each platform.
- FLUX (Analyst): reads performance data and recommends optimizations.
- PULSE (Media Buyer): builds, launches, and tunes paid ad campaigns.

User profile:
- Name: ${ctx.name || 'Creator'}
- Niche: ${ctx.niche || 'general'}
- Primary platform: ${ctx.platform || 'Instagram'}
- Goal: ${ctx.goal || 'grow audience'}
- Ad budget: ${ctx.budget ? '$' + ctx.budget + '/mo' : 'not set'}

Rules:
1. Always call plan_campaign first when the user wants to launch something new.
2. Before publishing, confirm the user has approved. Use request_approval if unsure.
3. Chain tools: plan → create → schedule → (optionally) launch_ads → report.
4. Be concise. Speak to the user like a project lead giving a status update.`
  },

  NOVA: {
    name: 'NOVA',
    role: 'Growth Strategist',
    color: '#00e5ff',
    description: 'Plans content calendars and growth strategy.',
    systemPrompt: (ctx) => `You are NOVA, ORBIT's Growth Strategist. Output a concrete, numbers-driven plan. Platform: ${ctx.platform}. Niche: ${ctx.niche}. Goal: ${ctx.goal}. Return JSON with: theme, cadence (posts/week), pillars (3-5), first_week_posts (array of {day, format, pillar, hook_idea}).`
  },

  VIBE: {
    name: 'VIBE',
    role: 'Content Creator',
    color: '#ff6b9d',
    description: 'Writes platform-native captions, hooks, and scripts.',
    systemPrompt: (ctx) => `You are VIBE, ORBIT's Content Creator. Write a platform-native post for ${ctx.platform} in the ${ctx.niche} niche. Return JSON: {caption, hook, hashtags (array of 5-15), cta, media_prompt (a short visual brief)}. No emoji spam. Hook must stop the scroll in the first 6 words.`
  },

  FLUX: {
    name: 'FLUX',
    role: 'Analytics Advisor',
    color: '#7fff6e',
    description: 'Turns stats into next-step recommendations.',
    systemPrompt: (ctx) => `You are FLUX, ORBIT's Analytics Advisor. Given a JSON block of metrics, return JSON: {diagnosis (1-2 sentences), top_wins (array), top_losses (array), next_actions (array of {action, expected_impact})}. Be precise, no fluff.`
  },

  PULSE: {
    name: 'PULSE',
    role: 'Paid Growth Agent',
    color: '#ffb830',
    description: 'Builds and manages paid ad campaigns.',
    systemPrompt: (ctx) => `You are PULSE, ORBIT's Media Buyer. Budget: $${ctx.budget || 0}/mo. Platform: ${ctx.platform}. Goal: ${ctx.goal}. Return a JSON ad plan: {objective, audience {interests, ages, geos}, creative_brief, daily_budget, bid_strategy, kpis (array of {metric, target})}. Assume Meta Ads unless specified.`
  }
};

// Tools exposed to ECHO. Each tool routes to a specialist or a platform action.
export const ORCHESTRATOR_TOOLS = [
  {
    name: 'plan_campaign',
    description: 'Delegate to NOVA to produce a content strategy and weekly posting calendar.',
    input_schema: {
      type: 'object',
      properties: {
        theme: { type: 'string', description: 'Optional campaign theme or angle' },
        duration_days: { type: 'number', description: 'How many days the plan covers' }
      },
      required: ['duration_days']
    }
  },
  {
    name: 'create_post',
    description: 'Delegate to VIBE to generate a single post (caption + hook + hashtags + media brief).',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['instagram', 'tiktok', 'twitter', 'linkedin', 'youtube'] },
        format: { type: 'string', enum: ['reel', 'carousel', 'static', 'short', 'tweet', 'thread'] },
        topic: { type: 'string' },
        pillar: { type: 'string', description: 'Which content pillar this belongs to' }
      },
      required: ['platform', 'format', 'topic']
    }
  },
  {
    name: 'schedule_post',
    description: 'Queue an already-created post for publishing at a specific time.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['instagram', 'tiktok', 'twitter', 'linkedin', 'youtube'] },
        post_id: { type: 'string', description: 'ID returned by create_post' },
        publish_at: { type: 'string', description: 'ISO 8601 timestamp' }
      },
      required: ['platform', 'post_id', 'publish_at']
    }
  },
  {
    name: 'publish_post',
    description: 'Immediately publish a created post to the target platform.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['instagram', 'tiktok', 'twitter', 'linkedin', 'youtube'] },
        post_id: { type: 'string' }
      },
      required: ['platform', 'post_id']
    }
  },
  {
    name: 'analyze_performance',
    description: 'Delegate to FLUX to diagnose recent performance metrics and suggest next actions.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string' },
        window_days: { type: 'number' }
      },
      required: ['platform', 'window_days']
    }
  },
  {
    name: 'launch_ad_campaign',
    description: 'Delegate to PULSE to design and launch a paid ad campaign (Meta / TikTok / etc).',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['meta', 'tiktok_ads', 'twitter_ads', 'google_ads'] },
        objective: { type: 'string', enum: ['awareness', 'traffic', 'engagement', 'leads', 'sales'] },
        daily_budget: { type: 'number', description: 'USD per day' },
        post_id: { type: 'string', description: 'Optional post to boost' }
      },
      required: ['platform', 'objective', 'daily_budget']
    }
  },
  {
    name: 'request_approval',
    description: 'Ask the user to confirm before executing a risky or costly action (publishing, spending money).',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Plain-English description of what needs approval' },
        action: { type: 'string', description: 'The tool that will run after approval' }
      },
      required: ['summary', 'action']
    }
  }
];

// Sonnet model used for all delegated specialist calls.
export const SPECIALIST_MODEL = 'claude-sonnet-4-20250514';
export const ORCHESTRATOR_MODEL = 'claude-sonnet-4-20250514';
