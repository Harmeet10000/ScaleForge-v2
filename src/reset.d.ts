/**
 * @total-typescript/ts-reset
 *
 * Patches broken TypeScript stdlib type signatures without touching runtime code.
 * This file has zero runtime overhead — it only affects type checking.
 *
 * Key fixes active in this project:
 *  - JSON.parse()          → returns `unknown` instead of `any`
 *  - fetch() response      → .json() returns `unknown` instead of `any`
 *  - Array.filter(Boolean) → narrows to non-nullable (T[] instead of (T | null)[])
 *  - Array.indexOf / lastIndexOf / includes → accept `unknown` safely
 *  - Map.get()             → returns `V | undefined` not just `V`
 *  - Object.keys/entries   → entries typed as [string, V][]
 *
 * NOTE: We do NOT use `typescript-eslint` (eslint-plugin-typescript) in this
 * project. Type-aware linting is handled entirely by oxlint with the
 * `typescript` plugin. This avoids two lint runtimes and keeps CI fast.
 *
 * @see https://www.totaltypescript.com/ts-reset
 */
import "@total-typescript/ts-reset";
