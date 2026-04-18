// Thin wrapper around the Anthropic Messages API. Centralizes auth, retries,
// and JSON extraction so every agent file stays small.

const API_URL = 'https://api.anthropic.com/v1/messages';

export async function callClaude({ model, system, messages, tools, max_tokens = 1500 }) {
  const body = { model, max_tokens, system, messages };
  if (tools) body.tools = tools;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API ${res.status}`);
  }
  return res.json();
}

// Pull the first ```json ... ``` block or raw JSON from an assistant message.
export function extractJSON(text) {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  try { return JSON.parse(raw); } catch {}
  const brace = raw.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch {} }
  return null;
}

// Convenience: send a one-shot prompt to a specialist and return parsed JSON.
export async function askSpecialist({ model, system, prompt }) {
  const result = await callClaude({
    model,
    system,
    messages: [{ role: 'user', content: prompt }]
  });
  const text = result.content?.find(b => b.type === 'text')?.text || '';
  return { raw: text, json: extractJSON(text) };
}
