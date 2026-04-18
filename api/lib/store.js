// Minimal in-memory store used across a single Vercel function invocation.
// Vercel serverless functions do not guarantee persistence between invocations,
// so callers should treat this as a scratchpad. For production, swap to
// Vercel KV / Upstash Redis by replacing the Map operations below.

const posts = new Map();
const jobs = new Map();

export function savePost(post) {
  const id = post.id || 'post_' + Math.random().toString(36).slice(2, 10);
  const stored = { ...post, id, created_at: new Date().toISOString() };
  posts.set(id, stored);
  return stored;
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
