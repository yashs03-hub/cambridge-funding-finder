import type { FundingItemView } from '@/lib/data';

/**
 * Every card carries `Verified N days ago` and a source link. This is the
 * trust mechanism, not decoration (§7) — so neither is conditional.
 */
export function FundingCard({ view }: { view: FundingItemView }) {
  const { item, deadline, verified, amount, dot } = view;

  return (
    <article className="card">
      <div className="card-title">
        <span className={`dot ${dot}`} aria-hidden="true" />
        <div>
          <h3>{item.title}</h3>
          <div className="provider">{item.provider_name}</div>
        </div>
      </div>

      <p className="desc">{item.description}</p>

      {item.eligibility_tags.length > 0 && (
        <div className="tags">
          {item.eligibility_tags.map((t) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="meta">
        <span className="amount">{amount}</span>
        <span className={`deadline ${deadline.state}`}>{deadline.text}</span>
      </div>

      <div className="provenance">
        <span>{verified}</span>
        <a href={item.source_url} target="_blank" rel="noreferrer noopener">
          Source <span aria-hidden="true">↗</span>
          <span className="visually-hidden">(opens in a new tab)</span>
        </a>
      </div>
    </article>
  );
}
