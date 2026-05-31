/**
 * src/core/utils/collections.ts
 *
 * Common collection utilities using es-toolkit.
 *
 * es-toolkit is a modern lodash alternative:
 *   - Tree-shakeable (import only what you use)
 *   - 2–3× smaller bundle than lodash
 *   - Full TypeScript types — no @types/* needed
 *   - Zero runtime deps
 *
 * This module re-exports a curated subset of es-toolkit functions with
 * project-specific wrappers where the ergonomics differ from lodash.
 */

import {
  chunk,
  uniqBy,
  groupBy,
  sortBy,
  omit,
  pick,
  merge,
  cloneDeep,
  differenceBy,
  intersectionBy,
  flatten,
  flatMap,
  keyBy,
  mapValues,
  sum,
  sumBy,
  minBy,
  maxBy,
  sample,
  shuffle,
  range,
  zip,
  zipObject,
  throttle,
  debounce,
  memoize,
  once,
  noop,
} from "es-toolkit"

// ── Re-exports (use these instead of importing es-toolkit directly) ────────────
export {
  // Arrays
  chunk,          // chunk([1,2,3,4], 2) → [[1,2],[3,4]]
  uniqBy,         // uniqBy(users, u => u.email) → unique users by email
  groupBy,        // groupBy(orders, o => o.status) → Record<status, Order[]>
  sortBy,         // sortBy(users, ['lastName', 'firstName'])
  differenceBy,   // differenceBy(a, b, x => x.id) → elements in a not in b
  intersectionBy, // intersectionBy(a, b, x => x.id) → elements in both
  flatten,        // flatten([[1],[2,3]]) → [1,2,3]
  flatMap,        // flatMap([1,2], n => [n, n*2]) → [1,2,2,4]
  keyBy,          // keyBy(users, u => u.id) → Record<id, User>
  sample,         // sample([1,2,3]) → random element
  shuffle,        // shuffle([1,2,3]) → shuffled copy
  range,          // range(0, 5) → [0,1,2,3,4]
  zip,            // zip([1,2], ['a','b']) → [[1,'a'],[2,'b']]
  zipObject,      // zipObject(['a','b'], [1,2]) → {a:1, b:2}
  // Objects
  omit,           // omit(user, ['password']) → user without password
  pick,           // pick(user, ['id', 'email']) → { id, email }
  merge,          // deep merge — use for config merging
  cloneDeep,      // deep clone — prefer structuredClone() for plain objects
  mapValues,      // mapValues({a:1,b:2}, v => v*2) → {a:2,b:4}
  // Math
  sum,            // sum([1,2,3]) → 6
  sumBy,          // sumBy(orders, o => o.amount) → total
  minBy,          // minBy(prices, p => p.value)
  maxBy,          // maxBy(scores, s => s.points)
  // Functions
  throttle,       // throttle(fn, 1000) — max once per second
  debounce,       // debounce(fn, 300) — fires 300ms after last call
  memoize,        // memoize(expensiveFn) — cache by first argument
  once,           // once(fn) — call exactly once
  noop,           // noop() — no-op function
}

// ── Project-specific wrappers ─────────────────────────────────────────────────

/**
 * Paginate an array.
 * Returns the slice for the given 1-indexed page number.
 *
 * @example
 *   paginate(items, { page: 2, pageSize: 10 })
 *   // → { data: items[10..19], total: items.length, page: 2, pageSize: 10 }
 */
export const paginate = <T>(
  items: ReadonlyArray<T>,
  opts: { page: number; pageSize: number },
): { data: T[]; total: number; page: number; pageSize: number } => {
  const { page, pageSize } = opts
  const start = (page - 1) * pageSize
  return {
    data: items.slice(start, start + pageSize) as T[],
    total: items.length,
    page,
    pageSize,
  }
}

/**
 * Move an element in an array by index.
 * Returns a new array — does not mutate.
 *
 * @example
 *   moveItem(['a','b','c'], 2, 0) → ['c','a','b']
 */
export const moveItem = <T>(arr: T[], from: number, to: number): T[] => {
  const result = [...arr]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item!)
  return result
}

/**
 * Object.entries with typed keys.
 * TypeScript's Object.entries returns [string, V][] — this preserves the key type.
 */
export const typedEntries = <K extends string, V>(
  obj: Record<K, V>,
): [K, V][] => Object.entries(obj) as [K, V][]

/**
 * Object.fromEntries with typed keys.
 */
export const typedFromEntries = <K extends string, V>(
  entries: Iterable<[K, V]>,
): Record<K, V> => Object.fromEntries(entries) as Record<K, V>

/**
 * Filter and type-narrow an array in one pass.
 *
 * @example
 *   filterDefined([1, undefined, 2, null, 3]) → [1, 2, 3]
 */
export const filterDefined = <T>(arr: (T | null | undefined)[]): T[] =>
  arr.filter((x): x is T => x != null)
