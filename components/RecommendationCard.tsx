import { describeDeadline, verifiedAgo } from '@/lib/format';
import type { Recommendation } from '@/lib/types';

const RANK_LABEL = ['Best match', 'Second', 'Third', 'Fourth', 'Fifth'];

/**
 * The one dark surface in the light system (§8.3).
 *
 * Two guardrails from §6 are structural here rather than left to the model:
 *   · `caveat` is a required field on Recommendation, so a card cannot render
 *     without a "why this might not fit". Eligibility at Cambridge is narrow
 *     and college-bound; a shortlist that only argues FOR each item misleads.
 *   · deadline and amount are rendered from the stored RECORD, never from
 *     model prose, so the assistant cannot state a figure the record lacks.
 */
export function RecommendationCard({ rec, now }: { rec: Recommendation; now?: Date }) {
  const { item } = rec;
  const deadline = describeDeadline(item.deadline_type, item.deadline_date, now);

  return (
    <div className="rec">
      <div className="rank">{RANK_LABEL[rec.rank - 1] ?? `#${rec.rank}`}</div>
      <h3>{item.title}</h3>
      <div className="rec-provider">
        {item.provider_name} · {item.amount_text ?? 'Amount not stated'} · {deadline.text}
      </div>
      <p className="why">{rec.why}</p>
      <p className="caveat">
        <b>Why this might not fit:</b> {rec.caveat}
      </p>
      <div className="rec-meta">
        <span>{verifiedAgo(item.last_verified_at, now)}</span>
        <a href={item.source_url} target="_blank" rel="noreferrer noopener">
          {item.provider_name} funding page <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}
