// Minimal in-memory store used across a single Vercel function invocation.
// Vercel serverless functions do not guarantee persistence between invocations,
// so callers should treat this as a scratchpad. For production, swap to
// Vercel KV / Upstash Redis by replacing the Map operations below.

const posts = new Map();
const jobs = new Map();
const nicheAnalyses = []; // append-only; latest is most relevant

export function savePost(post) {
  const id = post.id || 'post_' + Math.random().toString(36).slice(2, 10);
  const stored = { ...post, id, created_at: new Date().toISOString() };
  posts.set(id, stored);
  return stored;
}

export function updatePost(id, patch) {
  const existing = posts.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
  posts.set(id, updated);
  return updated;
}

export function getPost(id) {
  return posts.get(id);
}

export function listPosts() {
  return Array.from(posts.values());
}

export function scheduleJob(job) {
  const id = 'job_' + Math.random().toString(36).slice(2, 10);
  const stored = { ...job, id, status: 'scheduled', created_at: new Date().toISOString() };
  jobs.set(id, stored);
  return stored;
}

export function listJobs() {
  return Array.from(jobs.values());
}

// MUSE niche-intel storage. The most recent analysis is auto-injected into
// VIBE's context so every new post benefits from the latest competitor intel
// without the user having to re-paste it.
export function saveNicheAnalysis(analysis) {
  const stored = {
    id: 'muse_' + Math.random().toString(36).slice(2, 10),
    created_at: new Date().toISOString(),
    ...analysis
  };
  nicheAnalyses.push(stored);
  return stored;
}

export function getLatestNicheAnalysis() {
  return nicheAnalyses[nicheAnalyses.length - 1] || null;
}

export function listNicheAnalyses() {
  return nicheAnalyses.slice();
}
