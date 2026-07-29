import type { DeadlineState } from './format';
import type { FundingType } from './types';

/**
 * Listing filters (§7): college, type, and deadline status.
 * Pure functions, kept out of the component so they can be tested directly.
 */

export interface TypeFilter {
  key: string;
  label: string;
  types: FundingType[];
}

/**
 * Four visible buckets over six schema types. `bursary` and `scholarship`
 * fold into Grant rather than getting pills of their own: a student looking
 * for money does not distinguish them, and six pills is a wall.
 */
export const TYPE_FILTERS: TypeFilter[] = [
  { key: 'travel', label: 'Travel', types: ['travel'] },
  { key: 'hardship', label: 'Hardship', types: ['hardship'] },
  { key: 'grant', label: 'Grant', types: ['grant', 'bursary', 'scholarship'] },
  { key: 'prize', label: 'Prize', types: ['prize'] },
];

export interface DeadlineFilter {
  key: string;
  label: string;
  states: DeadlineState[];
}

/**
 * `Unknown` gets a pill of its own rather than being swept in with Open.
 * A student who only wants awards they can definitely still apply for and a
 * student willing to chase an unstated deadline are asking different
 * questions, and conflating them is how a listing quietly misleads.
 *
 * `closed` is in no bucket — a passed deadline is never something to filter
 * *toward*, only something to see struck through when no filter is applied.
 */
export const DEADLINE_FILTERS: DeadlineFilter[] = [
  { key: 'open', label: 'Open', states: ['fixed', 'urgent'] },
  { key: 'rolling', label: 'Rolling', states: ['rolling', 'recurring'] },
  { key: 'unknown', label: 'Unknown', states: ['unknown'] },
];

export interface FilterState {
  types: string[];
  deadlines: string[];
  providers: string[];
}

export const EMPTY_FILTERS: FilterState = { types: [], deadlines: [], providers: [] };

export function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

export interface FilterableItem {
  type: FundingType;
  providerId: string;
  deadlineState: DeadlineState;
}

/**
 * An empty bucket means "no constraint", not "match nothing" — so the
 * default view shows everything. The mockup pre-pressed `Open`; defaulting
 * to a live filter hides records on first load, which is the wrong default
 * for a product whose value is completeness of the tail.
 */
export function matches(item: FilterableItem, f: FilterState): boolean {
  if (f.types.length) {
    const allowed = new Set(
      TYPE_FILTERS.filter((t) => f.types.includes(t.key)).flatMap((t) => t.types),
    );
    if (!allowed.has(item.type)) return false;
  }

  if (f.deadlines.length) {
    const allowed = new Set(
      DEADLINE_FILTERS.filter((d) => f.deadlines.includes(d.key)).flatMap((d) => d.states),
    );
    if (!allowed.has(item.deadlineState)) return false;
  }

  if (f.providers.length && !f.providers.includes(item.providerId)) return false;

  return true;
}

export function countLabel(shown: number, total: number): string {
  if (shown === total) return `${total} award${total === 1 ? '' : 's'}`;
  return `${shown} of ${total} awards shown`;
}
