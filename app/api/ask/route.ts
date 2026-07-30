import { NextResponse } from 'next/server';
import type { Recommendation } from '@/lib/types';

/**
 * Assistant endpoint — Phase 4 (§10). NOT IMPLEMENTED.
 *
 * The pipeline this will run (§6):
 *   free text → (LLM) structured query
 *             → (SQL + pgvector, top ~40 candidates)
 *             → (LLM) ranked shortlist of 5
 *             → render in TypeScript
 *
 * Note it is TWO model calls, not the four subagents in the master spec:
 * retrieval is a pgvector query and the response composer is string
 * formatting — neither is model-shaped work.
 *
 * This returns 501 rather than the mockup's canned answer on purpose. A
 * plausible fabricated shortlist is precisely the failure this product exists
 * to avoid, and a matcher that has read three colleges out of thirty-one would
 * produce exactly that: confident answers whose omissions are invisible.
 */

export interface AskResponse {
  recommendations: Recommendation[];
  disclaimer: string;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const query = typeof body?.query === 'string' ? body.query.trim() : '';

  if (!query) {
    return NextResponse.json({ error: 'A question is required.' }, { status: 400 });
  }

  return NextResponse.json(
    {
      error:
        'The assistant is not built yet. It is Phase 4, and so far only three of the thirty-one colleges have been read — a shortlist drawn from those would look complete while silently missing most of Cambridge. Browse the college listing in the meantime.',
    },
    { status: 501 },
  );
}
