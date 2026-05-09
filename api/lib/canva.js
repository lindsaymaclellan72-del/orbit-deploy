// Canva Connect REST integration (server-side).
//
// Two modes:
//   1. Live  — when CANVA_ACCESS_TOKEN is set, calls api.canva.com to autofill
//              a brand template and export it. Requires:
//                CANVA_ACCESS_TOKEN     - OAuth access token
//                CANVA_BRAND_TEMPLATE_ID - a published Brand Template ID with
//                                         {{headline}} and {{subhead}} fields
//   2. Demo  — returns a deterministic placeholder media_url so the multi-agent
//              flow runs end-to-end without Canva credentials.
//
// The CANVAS specialist (see agents.js) is responsible for producing the
// design SPEC that this module consumes. This module is the "hands" — CANVAS
// is the "brain". When running the agent inside Claude Code, you can also
// bypass this module entirely and let Claude call the Canva MCP tools
// directly (see CLAUDE.md).

const API = 'https://api.canva.com/rest/v1';

function demo(spec) {
  const seed = Math.random().toString(36).slice(2, 10);
  return {
    ok: true,
    mode: 'demo',
    design_id: 'demo_design_' + seed,
    edit_url: `https://www.canva.com/design/demo_${seed}/edit`,
    media_url: `https://placehold.co/${spec?.dimensions?.replace('x', 'x') || '1080x1080'}/0a0a0f/ff3060/png?text=${encodeURIComponent((spec?.title || 'orbit-design').slice(0, 40))}`,
    spec
  };
}

async function pollExportJob(jobId, token, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const res = await fetch(`${API}/exports/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.job?.status === 'success') return data.job.urls?.[0] || null;
    if (data.job?.status === 'failed') throw new Error('Canva export failed: ' + (data.job.error?.message || 'unknown'));
  }
  throw new Error('Canva export timed out');
}

// Create a design from a brand template via autofill, then export to PNG/MP4.
// The `spec` is whatever CANVAS returned (see agents.js CANVAS prompt).
export async function createAndExportDesign(spec) {
  const token = process.env.CANVA_ACCESS_TOKEN;
  const templateId = process.env.CANVA_BRAND_TEMPLATE_ID;
  if (!token || !templateId) return demo(spec);

  try {
    // Pull a single hook headline + subhead from the spec for autofill.
    const firstScene = Array.isArray(spec?.scenes) ? spec.scenes[0] : null;
    const headline = firstScene?.elements?.find(e => e.type === 'text')?.value
      || spec?.title
      || 'ORBIT';
    const subhead = (spec?.scenes?.[1]?.elements?.find(e => e.type === 'text')?.value) || '';

    const autofillRes = await fetch(`${API}/autofills`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        brand_template_id: templateId,
        title: spec?.title || 'ORBIT post',
        data: {
          headline: { type: 'text', text: headline },
          subhead:  { type: 'text', text: subhead }
        }
      })
    });
    const autofill = await autofillRes.json();
    const designId = autofill.job?.result?.design?.id || autofill.design?.id;
    if (!designId) {
      return { ok: false, error: 'Canva autofill failed: ' + (autofill.error?.message || JSON.stringify(autofill).slice(0, 200)) };
    }

    const exportRes = await fetch(`${API}/exports`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        design_id: designId,
        format: { type: 'png' }
      })
    });
    const exportJob = await exportRes.json();
    const jobId = exportJob.job?.id;
    if (!jobId) {
      return { ok: false, error: 'Canva export init failed: ' + (exportJob.error?.message || 'no job id') };
    }

    const mediaUrl = await pollExportJob(jobId, token);
    return {
      ok: true,
      mode: 'live',
      design_id: designId,
      edit_url: `https://www.canva.com/design/${designId}/edit`,
      media_url: mediaUrl,
      spec
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
