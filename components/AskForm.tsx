'use client';

import { useState } from 'react';
import { RecommendationCard } from './RecommendationCard';
import type { Recommendation } from '@/lib/types';

const PLACEHOLDER =
  "e.g. I'm a second-year PhD student in Archaeology at Downing. I need to get to a dig in southern Italy this September and my department grant won't cover the flights.";

export function AskForm() {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);

  async function submit() {
    if (!query.trim() || pending) return;
    setPending(true);
    setError(null);
    setRecs(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong.');
        return;
      }
      setRecs(data.recommendations ?? []);
    } catch {
      setError('Could not reach the assistant.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="ask-box">
        <label htmlFor="ask-query" className="visually-hidden">
          Describe what you need funding for
        </label>
        <textarea
          id="ask-query"
          value={query}
          placeholder={PLACEHOLDER}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="ask-actions">
          {pending && (
            <div className="thinking label" role="status">
              <span>Searching…</span>
            </div>
          )}
          <button
            className="pill"
            style={{ marginLeft: 'auto' }}
            onClick={submit}
            disabled={pending || !query.trim()}
          >
            Find funding <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="ask-error" role="alert">
          {error}
        </p>
      )}

      {recs && recs.length > 0 && (
        <div className="answer">
          <div className="label">
            {recs.length} best match{recs.length === 1 ? '' : 'es'}, ranked
          </div>
          {recs.map((r) => (
            <RecommendationCard key={r.item.id} rec={r} />
          ))}
        </div>
      )}

      {recs && recs.length === 0 && (
        <div className="empty">No awards matched that. Try describing the cost you need covered.</div>
      )}
    </>
  );
}
