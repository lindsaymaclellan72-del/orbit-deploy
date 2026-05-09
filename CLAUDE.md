# ORBIT — Music Creator Social Agent

A multi-agent social-media posting system tuned for a hip hop / music production
/ songwriting / music industry creator. Drafts content informed by competitor
intel, designs visuals through Canva, and publishes to Instagram + TikTok after
human approval.

## Agents

| Agent  | Role                | Responsibility                                                               |
| ------ | ------------------- | ---------------------------------------------------------------------------- |
| ECHO   | Orchestrator        | Decides which specialist runs and in what order. The only agent the user talks to. |
| MUSE   | Niche Intel         | Reads competitor handles + sample top posts, returns winning patterns.       |
| NOVA   | Strategist          | Builds posting calendars, cadence, content pillars.                          |
| VIBE   | Creator             | Writes hooks, captions, hashtags, media briefs. Auto-uses latest MUSE output. |
| CANVAS | Designer            | Translates VIBE's media brief into a Canva-ready spec, exports a PNG/MP4.    |
| FLUX   | Analyst             | Reads metrics, recommends next moves.                                        |
| PULSE  | Media Buyer         | Plans + launches paid campaigns (Meta default).                              |

## Recommended flow for a new post

1. **Niche Intel tab** in the dashboard — paste 3-5 competitor handles + 5-10
   of their top recent posts (caption | hashtags | views). Hit *Run MUSE
   Analysis*. The result is stored and auto-injected into VIBE's next call.
2. Tell ECHO what you want: "Write a TikTok about why most beats sound the same
   in 2025, design the cover, draft only."
3. ECHO calls `create_post` (VIBE) → `design_visual` (CANVAS) → `request_approval`.
4. Review the draft + Canva preview in the **Posts** tab.
5. Approve → ECHO calls `publish_post` or `schedule_post`.

`publish_post` will NEVER fire without explicit approval in the same chat
session — this is enforced both in the ECHO system prompt and by the
`request_approval` tool returning `awaiting_user: true`.

## Environment variables

The system runs in **demo mode** for any platform whose credentials are
missing — no errors, just simulated success responses so the multi-agent flow
stays demoable end-to-end.

| Variable                        | Used by               | Required for live mode of                |
| ------------------------------- | --------------------- | ---------------------------------------- |
| `ANTHROPIC_API_KEY`             | all agents            | **always required**                       |
| `META_ACCESS_TOKEN`, `IG_USER_ID` | `publishInstagram`    | Instagram publish                        |
| `TIKTOK_ACCESS_TOKEN`           | `publishTikTok`       | TikTok publish                           |
| `CANVA_ACCESS_TOKEN`            | `lib/canva.js`        | real Canva designs                       |
| `CANVA_BRAND_TEMPLATE_ID`       | `lib/canva.js`        | real Canva designs (autofill template)   |
| `META_AD_ACCOUNT_ID`, `META_PAGE_ID` | `launchMetaAd`   | Meta ad campaigns                        |

## Canva integration — two modes

### Mode A — Canva MCP (when running the agent inside Claude Code)

If you're driving the project from a Claude Code session that has the Canva
MCP server attached, you can bypass the Connect REST integration entirely:

1. Run MUSE + create_post via the dashboard or by hitting `/api/orchestrate`
   directly.
2. Read back the post's `media_prompt`.
3. Have Claude Code call `mcp__<canva-server>__generate-design` with that
   prompt, then `mcp__<canva-server>__export-design` to get a PNG/MP4 URL.
4. POST that URL to `/api/post` with `{ post_id, media_url }` (or store it
   manually) so `publish_post` can use it.

This path avoids needing a Canva developer app + brand template setup.

### Mode B — Canva Connect REST (production, deployed Vercel)

`api/lib/canva.js` calls `https://api.canva.com/rest/v1` when
`CANVA_ACCESS_TOKEN` and `CANVA_BRAND_TEMPLATE_ID` are set. The template
should expose at minimum two text fields named `headline` and `subhead`.

Setup:
1. Register a Canva integration at https://www.canva.com/developers and grab
   a long-lived OAuth access token (or implement a refresh-token flow).
2. Create a Brand Template in Canva, publish it, copy the template ID.
3. Set both env vars in Vercel project settings.

## File map

```
api/
  orchestrate.js         # ECHO tool-loop — main entry point
  post.js                # Single-shot create+publish (used by Quick Actions)
  ads.js                 # Single-shot ad plan (PULSE)
  chat.js                # Plain conversational fallback
  lib/
    agents.js            # All agent prompts + tool definitions
    claude.js            # Anthropic SDK wrapper
    platforms.js         # IG / TikTok / X / LinkedIn / Meta Ads adapters
    canva.js             # Canva Connect REST + demo mode
    store.js             # In-memory post / job / niche-intel store
dashboard.html           # /command UI — chat + niche intel + posts feed
index.html               # Marketing site
```

## Adding a new agent

1. Add an entry to `AGENTS` in `api/lib/agents.js` with `name`, `role`,
   `color`, `description`, and `systemPrompt(ctx)`.
2. If it should be invokable by ECHO, add a tool to `ORCHESTRATOR_TOOLS` and
   a `runX` dispatcher in `api/orchestrate.js`.
3. Add an agent chip to the `.agents` grid in `dashboard.html`, the matching
   `--<name>` color CSS variable, and a `.agent.<name> .agent-dot` rule.
4. Update `agentForTool()` in the dashboard JS so the trace labels correctly.

## Things this does NOT do (yet)

- Persistent storage. Every Vercel function invocation gets a fresh
  in-memory `Map`. Swap `lib/store.js` for Vercel KV or Upstash Redis when
  you need durability.
- Live competitor scraping. MUSE only analyzes what you paste in — IG/TikTok
  don't expose top-posts data without business approval, and third-party
  scrapers violate platform ToS.
- Auto-scheduled publishing. `schedule_post` saves a job but no cron worker
  runs it. Add a Vercel Cron route or external scheduler that polls
  `listJobs()` and fires `publishTo()` at `publish_at`.
- Video generation. CANVAS produces a static design spec; for Reels/TikTok
  video you still need to either film or generate the video separately and
  attach a `video_url`.
