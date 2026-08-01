import { NextResponse } from 'next/server';
import type { Recommendation } from '@/lib/types';
import { ask, isAssistantConfigured, AssistantUnavailable } from '@/lib/assistant';
import { getAllItems, isSampleMode } from '@/lib/data';

/**
 * Assistant endpoint — Phase 4 (§6).
 *
 *   free text → deterministic retrieval over the committed dataset (top 40)
 *             → one model call to rank and explain
 *             → ids validated back against the candidate set
 *             → rendered from the STORED record
 *
 * This is one model call, not the two the spec anticipated: retrieval turned
 * out not to be model-shaped work at ~450 records (see lib/retrieval.ts), and
 * the response composer is string formatting.
 *
 * Three failure modes are handled explicitly rather than papered over, because
 * each of them, done wrong, produces a confident answer that is false:
 *
 *   · No API key        → 501, honestly. The site keeps working; the assistant
 *                         says it is off. It never falls back to canned text.
 *   · Sample data       → 501. Recommending invented awards is the exact
 *                         failure this product exists to prevent.
 *   · Model unreachable → 503, saying so. Not an empty shortlist, which reads
 *                         as "nothing suits you".
 *
 * An empty shortlist from a WORKING assistant is a real answer and returns 200.
 * "Nothing here fits" is useful; "nothing here fits" when the model was down
 * is a lie.
 */

export interface AskResponse {
  recommendations: Recommendation[];
  disclaimer: string;
  considered: number;
}

const DISCLAIMER =
  'Always check the college’s own page before applying — eligibility at Cambridge is narrow and college-bound, and pages change. Every award here links to its source.';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const query = typeof body?.query === 'string' ? body.query.trim() : '';

  if (!query) {
    return NextResponse.json({ error: 'A question is required.' }, { status: 400 });
  }
  if (query.length > 2000) {
    return NextResponse.json({ error: 'That question is too long.' }, { status: 400 });
  }

  if (isSampleMode()) {
    return NextResponse.json(
      {
        error:
          'The assistant is off because this deployment is serving sample data. Recommending invented awards is exactly the failure this tool exists to prevent.',
      },
      { status: 501 },
    );
  }

  if (!isAssistantConfigured()) {
    return NextResponse.json(
      {
        error:
          'The assistant is not configured on this deployment — it needs an OPENAI_API_KEY. The full funding listing works without it.',
      },
      { status: 501 },
    );
  }

  try {
    const { recommendations, considered } = await ask(getAllItems(), query, new Date());
    return NextResponse.json({ recommendations, considered, disclaimer: DISCLAIMER } satisfies AskResponse);
  } catch (err) {
    const detail = err instanceof AssistantUnavailable ? err.message : 'unknown error';
    console.error('assistant failed:', detail);
    return NextResponse.json(
      {
        error:
          'The assistant could not reach its model just now. This is a fault on our side, not a sign that nothing suits you — please try again, or browse the listing.',
      },
      { status: 503 },
    );
  }
}
