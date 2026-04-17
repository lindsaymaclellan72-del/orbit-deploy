export default async function handler(req, res) {

  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', 'https://orbitaiagency.ca');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, system } = req.body;

  if (!messages || !system) return res.status(400).json({ error: 'Missing messages or system prompt' });
  if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'Invalid messages format' });

  const trimmedMessages = messages.slice(-20);

  for (const m of trimmedMessages) {
    if (!m.role || !m.content || typeof m.content !== 'string')
      return res.status(400).json({ error: 'Invalid message format' });
    if (!['user', 'assistant'].includes(m.role))
      return res.status(400).json({ error: 'Invalid message role' });
    if (m.content.length > 4000)
      return res.status(400).json({ error: 'Message too long' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ── SSE streaming headers ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

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
        max_tokens: 1024,
        system,
        messages: trimmedMessages,
        stream: true
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', response.status, error);
      res.write(`data: ${JSON.stringify({ error: 'AI service error. Please try again.' })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            res.write(`data: ${JSON.stringify({ chunk: parsed.delta.text })}\n\n`);
          }
        } catch(e) {}
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('Proxy error:', err);
    res.write(`data: ${JSON.stringify({ error: 'Server error. Please try again.' })}\n\n`);
    res.end();
  }
}
