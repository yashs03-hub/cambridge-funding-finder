'use client';

import { useMemo, useState } from 'react';
import { FundingCard } from './FundingCard';
import {
  DEADLINE_FILTERS,
  EMPTY_FILTERS,
  TYPE_FILTERS,
  countLabel,
  matches,
  toggle,
  type FilterState,
} from '@/lib/filters';
import type { FundingItemView } from '@/lib/data';

export function Listing({ items }: { items: FundingItemView[] }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // Providers present in the data, not all 31 — a college filter that offers
  // colleges with zero listed awards promises coverage we do not have.
  const providers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of items) seen.set(v.item.provider_id, v.item.provider_name);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const shown = useMemo(
    () =>
      items.filter((v) =>
        matches(
          { type: v.item.type, providerId: v.item.provider_id, deadlineState: v.deadline.state },
          filters,
        ),
      ),
    [items, filters],
  );

  const set = (key: keyof FilterState) => (value: string) =>
    setFilters((f) => ({ ...f, [key]: toggle(f[key], value) }));

  return (
    <section className="listing" id="listing">
      <div className="inner">
        <div className="section-head">
          <h2>Colleges</h2>
          <div className="count label" role="status">
            {countLabel(shown.length, items.length)}
          </div>
        </div>

        <div className="filters">
          <div className="filter-group" role="group" aria-label="Filter by type">
            <div className="label">Type</div>
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.key}
                className="pill"
                aria-pressed={filters.types.includes(t.key)}
                onClick={() => set('types')(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="filter-group trailing" role="group" aria-label="Filter by deadline">
            <div className="label">Deadline</div>
            {DEADLINE_FILTERS.map((d) => (
              <button
                key={d.key}
                className="pill"
                aria-pressed={filters.deadlines.includes(d.key)}
                onClick={() => set('deadlines')(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {providers.length > 1 && (
          <div className="filters">
            <div className="filter-group" role="group" aria-label="Filter by college">
              <div className="label">College</div>
              {providers.map(([id, name]) => (
                <button
                  key={id}
                  className="pill"
                  aria-pressed={filters.providers.includes(id)}
                  onClick={() => set('providers')(id)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {shown.length > 0 ? (
          <div className="grid">
            {shown.map((v) => (
              <FundingCard key={v.item.id} view={v} />
            ))}
          </div>
        ) : (
          <div className="empty">
            {items.length === 0
              ? 'No approved awards yet. Records appear here once they have been reviewed.'
              : 'No awards match those filters.'}
          </div>
        )}
      </div>
    </section>
  );
}
