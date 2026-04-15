export default async function handler(req, res) {

  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', 'https://orbitaiagency.ca');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, system } = req.body;

  // Validate inputs
  if (!messages || !system) {
    return res.status(400).json({ error: 'Missing messages or system prompt' });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  // Cap message history to last 20 to prevent abuse
  const trimmedMessages = messages.slice(-20);

  // Validate each message has role + content
  for (const m of trimmedMessages) {
    if (!m.role || !m.content || typeof m.content !== 'string') {
      return res.status(400).json({ error: 'Invalid message format' });
    }
    if (!['user', 'assistant'].includes(m.role)) {
      return res.status(400).json({ error: 'Invalid message role' });
    }
    // Limit individual message length
    if (m.content.length > 4000) {
      return res.status(400).json({ error: 'Message too long' });
    }
  }

  // Check API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1000,
  system,
  messages: trimmedMessages,
  tools: [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5
    }
  ]
})
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', response.status, error);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await response.json();
    const reply = data.content?.filter(b => b.type === 'text').map(b => b.text || '').join('') || '';

    if (!reply) {
      return res.status(502).json({ error: 'Empty response from AI. Please try again.' });
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
