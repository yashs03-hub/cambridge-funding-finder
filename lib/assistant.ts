import type { FundingItem, Recommendation } from './types';
import { retrieve } from './retrieval';
import { describeDeadline } from './format';

/**
 * The assistant (§6, stage 2): rank retrieved candidates and explain them.
 *
 * ── The safety property ────────────────────────────────────────────────
 * The model never produces a funding record. It receives a numbered list of
 * candidates that retrieval already selected from the committed dataset, and
 * may only return ids from that list. Anything else is discarded before the
 * response is built.
 *
 * This is the same shape as the evidence-quote gate on extraction: the model
 * proposes, and something it does not control decides. It cannot invent an
 * award, cannot invent a college, cannot invent a deadline or an amount —
 * those fields are rendered from the stored record by RecommendationCard and
 * are never read back from model prose.
 *
 * What the model genuinely contributes is the two pieces of text a keyword
 * search cannot write: why this award fits *this* student's stated situation,
 * and why it might not.
 *
 * ── Why `caveat` is required ───────────────────────────────────────────
 * Eligibility at Cambridge is narrow and college-bound. A shortlist that only
 * argues in favour of each item is actively misleading, because the reader
 * cannot tell "you are eligible" from "this exists". The field is required in
 * the schema and a recommendation missing one is dropped rather than shown.
 */

const MODEL = process.env.ASSISTANT_MODEL || 'gpt-5.4-mini';
const TIMEOUT_MS = 45_000;
const MAX_RECOMMENDATIONS = 5;

export class AssistantUnavailable extends Error {}

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM = `You help Cambridge students find college funding they can actually apply for.

You are given a student's description of their situation and a numbered list of candidate awards drawn from a verified database. Your job is to choose the best matches and explain them.

HARD RULES

1. You may ONLY recommend awards from the candidate list, referenced by their exact id. Never invent an award, a college, an amount or a deadline. If nothing in the list genuinely fits, return an empty list — that is a correct and useful answer.

2. Never state a deadline, amount or eligibility rule in your text. Those are rendered from the verified record alongside your words, and repeating them risks contradicting the source. Write about fit, not figures.

3. Every recommendation MUST include a caveat: a specific reason this award might not work for this student. Eligibility here is narrow and college-bound. "You may not be eligible" is useless — say what would disqualify them, drawn from the award's stated eligibility. If a student has not told you their college, and the award is college-restricted, that is the caveat.

4. Rank by genuine fit, not by amount. A £90 music fund the student can actually get beats a £30,000 scholarship they cannot.

5. Be brief. Two sentences maximum for the why field, one for the caveat field. Students are scanning.

6. Do not address the student by name or invent details about them. Work only from what they wrote.`;

interface ModelPick {
  id: string;
  why: string;
  caveat: string;
}

/** Compact view of a candidate — enough to rank on, no more. */
function candidateLine(item: FundingItem, now: Date): string {
  const d = describeDeadline(item.deadline_type, item.deadline_date, now, item.deadline_recurrence);
  return [
    `id: ${item.id}`,
    `college: ${item.provider_name}`,
    `title: ${item.title}`,
    `type: ${item.type}`,
    `amount: ${item.amount_text ?? 'not stated'}`,
    `deadline: ${d.text}`,
    `eligibility: ${item.eligibility_text ?? 'not stated'}`,
    `about: ${item.description}`,
  ].join('\n');
}

async function callModel(query: string, candidates: FundingItem[], now: Date): Promise<ModelPick[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AssistantUnavailable('OPENAI_API_KEY is not set');

  const user = `Student's situation:
"""
${query}
"""

Candidate awards (${candidates.length}):

${candidates.map((c) => candidateLine(c, now)).join('\n---\n')}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'shortlist',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['recommendations'],
            properties: {
              recommendations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'why', 'caveat'],
                  properties: {
                    id: { type: 'string' },
                    why: { type: 'string' },
                    caveat: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  const body = await res.json();
  if (body.error) throw new AssistantUnavailable(`${body.error.type}: ${body.error.message}`);
  const parsed = JSON.parse(body.choices[0].message.content);
  return parsed.recommendations ?? [];
}

export interface AskResult {
  recommendations: Recommendation[];
  /** How many records retrieval considered — shown so an empty answer is legible. */
  considered: number;
}

export async function ask(
  items: FundingItem[],
  query: string,
  now: Date = new Date(),
): Promise<AskResult> {
  const candidates = retrieve(items, query, 40, now);
  if (candidates.length === 0) return { recommendations: [], considered: 0 };

  const byId = new Map(candidates.map((c) => [c.item.id, c.item]));
  const picks = await callModel(query, candidates.map((c) => c.item), now);

  const seen = new Set<string>();
  const recommendations: Recommendation[] = [];

  for (const pick of picks) {
    // The gate: an id the model was not given does not exist as far as this
    // response is concerned. Silently dropping is right — a hallucinated id
    // is not a partial answer to salvage.
    const item = byId.get(pick.id);
    if (!item || seen.has(pick.id)) continue;
    // §6: a recommendation without a caveat is not shippable.
    if (!pick.why?.trim() || !pick.caveat?.trim()) continue;

    seen.add(pick.id);
    recommendations.push({
      item,
      rank: recommendations.length + 1,
      why: pick.why.trim(),
      caveat: pick.caveat.trim(),
    });
    if (recommendations.length >= MAX_RECOMMENDATIONS) break;
  }

  return { recommendations, considered: candidates.length };
}
