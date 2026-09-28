/**
 * LLM Service — Grok (xAI) & Anthropic Claude integration with rule-based fallback.
 *
 * Supports:
 *   - Grok (xAI): set GROK_API_KEY or XAI_API_KEY in backend/.env
 *   - Anthropic:  set ANTHROPIC_API_KEY in backend/.env
 *   - Fallback:   structured rule-based analysis if no key is configured
 */

import Anthropic from '@anthropic-ai/sdk';

let anthropicClient = null;

function getAnthropicClient() {
  if (anthropicClient) return anthropicClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

/**
 * Checks whether an LLM is available (Groq, Grok, or Anthropic API key configured).
 */
export function isLlmAvailable() {
  return !!(
    process.env.GROQ_API_KEY ||
    process.env.GROK_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  );
}

/**
 * Returns human-readable name of the active LLM provider.
 */
export function getLlmProviderName() {
  const key = process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (key) {
    const isGroq = key.startsWith('gsk_') || !!process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || process.env.GROK_MODEL || (isGroq ? 'openai/gpt-oss-120b' : 'grok-2-latest');
    return isGroq ? `Groq (${model})` : `Grok (${model})`;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return `Anthropic (${process.env.ANTHROPIC_MODEL || 'Claude Sonnet 4.6'})`;
  }
  return 'Rule-based fallback';
}

/**
 * Unified completion helper that routes to Groq, Grok (xAI), or Anthropic.
 */
export async function callLlm({ system, userMessage, maxTokens = 800 }) {
  const key = process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (key) {
    const isGroq = key.startsWith('gsk_') || !!process.env.GROQ_API_KEY;
    const endpoint = isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.x.ai/v1/chat/completions';
    const model = process.env.GROQ_MODEL || process.env.GROK_MODEL || (isGroq ? 'openai/gpt-oss-120b' : 'grok-2-latest');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${isGroq ? 'Groq' : 'xAI'} API HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim();
  }

  const anthropic = getAnthropicClient();
  if (anthropic) {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userMessage }],
      system,
    });
    return response.content?.[0]?.text?.trim();
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Risk Explanation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Generates a risk explanation for a proposed change, citing past incidents.
 */
export async function generateRiskExplanation({
  change, riskScore, riskLevel, factors, incidents, patterns, recommendations,
}) {
  if (!isLlmAvailable()) {
    return generateFallbackRiskExplanation({
      change, riskScore, riskLevel, factors, incidents, patterns, recommendations,
    });
  }

  const prompt = buildRiskPrompt({
    change, riskScore, riskLevel, factors, incidents, patterns, recommendations,
  });

  const system = `You are PipelineMemory, a DevOps pipeline intelligence agent. You analyze deployment risk by examining historical data. Be concise, specific, and cite evidence from past incidents. Use bullet points. Never make up data — only reference the incidents and patterns provided.`;

  try {
    const text = await callLlm({ system, userMessage: prompt, maxTokens: 800 });
    return text || generateFallbackRiskExplanation({
      change, riskScore, riskLevel, factors, incidents, patterns, recommendations,
    });
  } catch (err) {
    console.error(`[LLM] API error (${getLlmProviderName()}), falling back to rule-based:`, err.message);
    return generateFallbackRiskExplanation({
      change, riskScore, riskLevel, factors, incidents, patterns, recommendations,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Ask (chat) endpoint                                                */
/* ------------------------------------------------------------------ */

/**
 * Answers a natural-language question using stored deployment data.
 */
export async function answerQuestion(question, context) {
  if (!isLlmAvailable()) {
    return generateFallbackAnswer(question, context);
  }

  const contextBlock = buildContextBlock(context);
  const userMessage = `${contextBlock}\n\nQuestion: ${question}`;
  const system = `You are PipelineMemory, a DevOps pipeline intelligence agent with perfect memory of all deployments, failures, and incidents. Answer questions by analyzing the provided data. Be specific — cite deployment IDs, dates, services, and error messages when relevant. If the data doesn't contain the answer, say so. Use markdown formatting.`;

  try {
    const text = await callLlm({ system, userMessage, maxTokens: 1000 });
    return text || generateFallbackAnswer(question, context);
  } catch (err) {
    console.error(`[LLM] API error (${getLlmProviderName()}), falling back to rule-based:`, err.message);
    return generateFallbackAnswer(question, context);
  }
}

/* ================================================================== */
/*  Private helpers                                                    */
/* ================================================================== */

function buildRiskPrompt({ change, riskScore, riskLevel, factors, incidents, patterns, recommendations }) {
  const factorLines = factors.map(f =>
    `- ${f.name}: score ${f.score}/100 (weight ${f.weight}%) — ${f.detail}`
  ).join('\n');

  const incidentLines = incidents.length > 0
    ? incidents.map(i =>
        `- [Deploy #${i.deployment_id}] ${i.service} (${i.change_type}) on ${i.timestamp}: ${i.status}${i.incident_summary ? ` — Incident: ${i.incident_summary}` : ''}`
      ).join('\n')
    : '(No similar past incidents found)';

  const patternLines = patterns.length > 0
    ? patterns.map(p => `- ${p.pattern_description} (seen ${p.evidence_count}x, risk ×${p.risk_multiplier})`).join('\n')
    : '(No matching patterns)';

  return `Analyze this proposed deployment and explain the risk:

PROPOSED CHANGE:
- Service: ${change.service}
- Change type: ${change.change_type}
- Files changed: ${change.files_changed || 'unknown'}
- Lines changed: ${change.lines_changed || 'unknown'}
- Author: ${change.author || 'unknown'}

RISK SCORE: ${riskScore}/100 (${riskLevel})

RISK FACTORS:
${factorLines}

SIMILAR PAST INCIDENTS:
${incidentLines}

MATCHING PATTERNS:
${patternLines}

RECOMMENDED ACTIONS:
${recommendations.map(r => `- ${r}`).join('\n')}

Write a 2-3 paragraph explanation of WHY this deployment is ${riskLevel} risk, citing the specific past incidents and patterns above. End with the top recommendation.`;
}

function buildContextBlock(context) {
  const { deployments, failures, incidents, patterns, stats } = context;

  let block = `=== PIPELINE MEMORY DATA ===\n\n`;
  block += `STATS:\n${JSON.stringify(stats, null, 2)}\n\n`;

  if (deployments.length > 0) {
    block += `RECENT DEPLOYMENTS (last 20):\n`;
    block += deployments.slice(0, 20).map(d =>
      `- #${d.id} ${d.service} v${d.version} by ${d.author} on ${d.timestamp} — ${d.status} (${d.change_type}, ${d.lines_changed} lines)`
    ).join('\n');
    block += '\n\n';
  }

  if (failures.length > 0) {
    block += `RECENT FAILURES (last 15):\n`;
    block += failures.slice(0, 15).map(f =>
      `- Deploy #${f.deployment_id} stage:${f.stage} — ${f.error_message}${f.root_cause ? ` (cause: ${f.root_cause})` : ''}`
    ).join('\n');
    block += '\n\n';
  }

  if (incidents.length > 0) {
    block += `RECENT INCIDENTS (last 15):\n`;
    block += incidents.slice(0, 15).map(i =>
      `- Deploy #${i.deployment_id} severity:${i.severity} — ${i.summary} (affected: ${i.downstream_services_affected})`
    ).join('\n');
    block += '\n\n';
  }

  if (patterns.length > 0) {
    block += `LEARNED PATTERNS:\n`;
    block += patterns.map(p =>
      `- ${p.pattern_description} (evidence: ${p.evidence_count}, risk ×${p.risk_multiplier})`
    ).join('\n');
    block += '\n\n';
  }

  return block;
}

/* ------------------------------------------------------------------ */
/*  Fallback generators (no API key required)                          */
/* ------------------------------------------------------------------ */

function generateFallbackRiskExplanation({
  change, riskScore, riskLevel, factors, incidents, patterns, recommendations,
}) {
  let explanation = `## Risk Assessment: ${riskLevel} (${riskScore}/100)\n\n`;
  explanation += `**Proposed change:** ${change.change_type} to **${change.service}**`;
  if (change.lines_changed) explanation += ` (${change.lines_changed} lines)`;
  explanation += `\n\n`;

  /* Top factors */
  const sorted = [...factors].sort((a, b) => (b.score * b.weight) - (a.score * a.weight));
  explanation += `### Key Risk Factors\n`;
  for (const f of sorted.slice(0, 3)) {
    explanation += `- **${f.name}** (${f.score}/100): ${f.detail}\n`;
  }
  explanation += '\n';

  /* Past incidents */
  if (incidents.length > 0) {
    explanation += `### Similar Past Incidents\n`;
    for (const inc of incidents.slice(0, 3)) {
      explanation += `- **Deploy #${inc.deployment_id}** to ${inc.service} (${inc.timestamp}): ${inc.status}`;
      if (inc.incident_summary) explanation += ` — _${inc.incident_summary}_`;
      explanation += '\n';
    }
    explanation += '\n';
  }

  /* Patterns */
  if (patterns.length > 0) {
    explanation += `### Matching Learned Patterns\n`;
    for (const p of patterns) {
      explanation += `- ${p.pattern_description} _(seen ${p.evidence_count}×, risk multiplier ×${p.risk_multiplier})_\n`;
    }
    explanation += '\n';
  }

  /* Recommendation */
  if (recommendations.length > 0) {
    explanation += `### Recommended Actions\n`;
    for (const r of recommendations) {
      explanation += `- ${r}\n`;
    }
  }

  return explanation;
}

function generateFallbackAnswer(question, context) {
  const q = question.toLowerCase();
  const { deployments, failures, incidents, patterns, stats } = context;

  /* Try to match common question types */

  /* "Why did X fail?" */
  const failMatch = q.match(/why did (.+?) fail/);
  if (failMatch) {
    const service = failMatch[1].trim();
    const relatedFailures = failures.filter(f => {
      const dep = deployments.find(d => d.id === f.deployment_id);
      return dep && dep.service.includes(service);
    });

    if (relatedFailures.length === 0) {
      return `I don't have records of failures for "${service}". Try checking the service name or ask about a specific deployment.`;
    }

    let answer = `## Failures for "${service}"\n\n`;
    for (const f of relatedFailures.slice(0, 5)) {
      const dep = deployments.find(d => d.id === f.deployment_id);
      answer += `- **Deploy #${f.deployment_id}** (${dep?.timestamp || 'unknown date'}): ${f.error_message}`;
      if (f.root_cause) answer += `\n  - Root cause: ${f.root_cause}`;
      if (f.fix_applied) answer += `\n  - Fix: ${f.fix_applied}`;
      answer += '\n';
    }
    return answer;
  }

  /* "Which service is most fragile/risky?" */
  if (q.includes('fragile') || q.includes('risky') || q.includes('worst') || q.includes('most failure')) {
    const serviceCounts = {};
    for (const d of deployments) {
      if (!serviceCounts[d.service]) serviceCounts[d.service] = { total: 0, failed: 0 };
      serviceCounts[d.service].total++;
      if (d.status !== 'success') serviceCounts[d.service].failed++;
    }

    const ranked = Object.entries(serviceCounts)
      .map(([svc, c]) => ({ service: svc, rate: c.total > 0 ? (c.failed / c.total * 100).toFixed(1) : 0, ...c }))
      .sort((a, b) => b.rate - a.rate);

    let answer = `## Service Fragility Ranking\n\n| Service | Deploys | Failures | Failure Rate |\n|---------|---------|----------|-------------|\n`;
    for (const r of ranked) {
      answer += `| ${r.service} | ${r.total} | ${r.failed} | ${r.rate}% |\n`;
    }
    return answer;
  }

  /* "What patterns have you learned?" */
  if (q.includes('pattern') || q.includes('learn')) {
    if (patterns.length === 0) return 'No patterns have been learned yet. Ingest more deployment data to discover patterns.';

    let answer = `## Learned Patterns (${patterns.length} total)\n\n`;
    for (const p of patterns) {
      answer += `- **${p.pattern_description}** — risk ×${p.risk_multiplier}, evidence: ${p.evidence_count} events\n`;
    }
    return answer;
  }

  /* Stats / overview */
  if (q.includes('overview') || q.includes('stats') || q.includes('summary') || q.includes('how many')) {
    return `## Pipeline Overview\n\n- **Total deployments:** ${stats.total_deployments}\n- **Success rate:** ${stats.success_rate}%\n- **Total failures:** ${stats.total_failures}\n- **Total incidents:** ${stats.total_incidents}\n- **Avg time to resolve:** ${stats.avg_ttr} min\n- **Services tracked:** ${stats.services?.join(', ') || 'N/A'}`;
  }

  /* Generic fallback */
  let answer = `Based on ${deployments.length} deployments in memory:\n\n`;
  answer += `- **Success rate:** ${stats.success_rate}%\n`;
  answer += `- **Most active service:** ${stats.most_active_service || 'N/A'}\n`;
  answer += `- **Recent failures:** ${failures.slice(0, 3).map(f => `Deploy #${f.deployment_id} (${f.stage}: ${f.error_message})`).join('; ') || 'None'}\n\n`;
  answer += `_For a more detailed answer, configure your ANTHROPIC_API_KEY for LLM-powered responses._`;
  return answer;
}
